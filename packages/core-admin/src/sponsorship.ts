/**
 * 후원 중개 (문서 06).
 *
 * 플랫폼은 소개·매칭만 한다 — 자금은 경유하지 않는다. 미성년은 후원 대상에서 제외한다.
 * 후원사 연락처·제안 내용은 선수 본인만 본다.
 */
import { query, queryOne } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export interface SponsorshipProfile {
  person_id: UUID;
  is_open: boolean;
  headline_i18n: I18nText;
  updated_at: string;
}

export class SponsorshipError extends Error {
  constructor(public code: 'MINOR' | 'NO_ATHLETE' | 'NOT_OWNER' | 'CLOSED') {
    super(code);
  }
}

/** 만 18세 미만인지 — 미성년은 후원 프로필을 열 수 없다. */
async function isMinor(personId: UUID): Promise<boolean> {
  const r = await queryOne<{ minor: boolean | null }>(
    `SELECT (birth_date IS NULL OR EXTRACT(YEAR FROM age(birth_date)) < 18) AS minor
       FROM core.person WHERE id = $1`,
    [personId]
  );
  // 생년월일이 없으면(나이 불명) 미성년으로 간주해 막는다 — 공개 정책과 동일.
  return r?.minor !== false;
}

/** 후원 프로필을 켜거나 끈다. 본인만. 미성년·비선수는 켤 수 없다. */
export async function setSponsorshipProfile(
  personId: UUID,
  input: { isOpen: boolean; headlineI18n?: I18nText }
): Promise<SponsorshipProfile> {
  if (input.isOpen) {
    if (await isMinor(personId)) throw new SponsorshipError('MINOR');
    const athlete = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM sport.registration
        WHERE person_id = $1 AND reg_type = 'ATHLETE' AND status = 'APPROVED'`,
      [personId]
    );
    if ((athlete?.n ?? 0) === 0) throw new SponsorshipError('NO_ATHLETE');
  }
  const rows = await query<SponsorshipProfile>(
    `INSERT INTO sponsorship.profile (person_id, is_open, headline_i18n, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (person_id) DO UPDATE
       SET is_open = EXCLUDED.is_open,
           headline_i18n = COALESCE(EXCLUDED.headline_i18n, sponsorship.profile.headline_i18n),
           updated_at = now()
     RETURNING *`,
    [personId, input.isOpen, JSON.stringify(input.headlineI18n ?? {})]
  );
  await writeAudit({
    actorPersonId: personId, entitySchema: 'sponsorship', entityTable: 'profile',
    entityId: personId, action: input.isOpen ? 'SPONSORSHIP_OPEN' : 'SPONSORSHIP_CLOSE',
  });
  return rows[0];
}

export async function getSponsorshipProfile(personId: UUID): Promise<SponsorshipProfile | null> {
  return queryOne<SponsorshipProfile>(`SELECT * FROM sponsorship.profile WHERE person_id = $1`, [personId]);
}

export interface SponsorshipTarget {
  person_id: UUID;
  name: string;
  is_open: boolean;
  headline_i18n: I18nText;
}

/**
 * 제안 대상 선수의 표시 정보 (이름·공개 여부). 후원 제안 화면에서만 쓴다.
 * is_open 이 true 라는 것은 이미 성인·승인 선수 가드를 통과했다는 뜻이다(setSponsorshipProfile 참고).
 * 공개(open)가 아니면 null 을 돌려 화면이 "받지 않음"으로 처리하게 한다 — 임의 신원 조회로 쓰지 못하게.
 */
export async function getSponsorshipTarget(personId: UUID): Promise<SponsorshipTarget | null> {
  return queryOne<SponsorshipTarget>(
    `SELECT p.id AS person_id,
            COALESCE(p.name_latin, p.full_name) AS name,
            sp.is_open, sp.headline_i18n
       FROM sponsorship.profile sp
       JOIN core.person p ON p.id = sp.person_id
      WHERE sp.person_id = $1 AND sp.is_open`,
    [personId]
  );
}

export interface ProposalRow {
  id: UUID;
  athlete_person_id: UUID;
  sponsor_name: string;
  sponsor_contact: string | null;
  sponsor_org_id: UUID | null;
  submitted_by: UUID | null;
  message: string | null;
  budget: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
}

/**
 * 후원 제안 제출. 후원 가능(open)한 선수에게만 넣을 수 있다.
 * 금액을 처리하지 않는다 — 예산은 참고 텍스트일 뿐이다.
 */
export async function submitProposal(input: {
  athletePersonId: UUID;
  sponsorName: string;
  sponsorContact?: string | null;
  sponsorOrgId?: UUID | null;
  submittedBy?: UUID | null;
  message?: string | null;
  budget?: string | null;
}): Promise<ProposalRow> {
  const open = await queryOne<{ is_open: boolean }>(
    `SELECT is_open FROM sponsorship.profile WHERE person_id = $1`,
    [input.athletePersonId]
  );
  if (!open?.is_open) throw new SponsorshipError('CLOSED');

  const rows = await query<ProposalRow>(
    `INSERT INTO sponsorship.proposal
       (athlete_person_id, sponsor_name, sponsor_contact, sponsor_org_id, submitted_by, message, budget)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      input.athletePersonId, input.sponsorName, input.sponsorContact ?? null,
      input.sponsorOrgId ?? null, input.submittedBy ?? null, input.message ?? null, input.budget ?? null,
    ]
  );
  await writeAudit({
    actorPersonId: input.submittedBy, entitySchema: 'sponsorship', entityTable: 'proposal',
    entityId: rows[0].id, action: 'PROPOSAL_SENT',
    after: { athlete: input.athletePersonId, sponsor: input.sponsorName },
  });
  return rows[0];
}

/** 선수 본인이 받은 제안 목록 (연락처 포함 — 본인만 호출). */
export async function listProposalsForAthlete(personId: UUID): Promise<ProposalRow[]> {
  return query<ProposalRow>(
    `SELECT * FROM sponsorship.proposal WHERE athlete_person_id = $1 ORDER BY created_at DESC`,
    [personId]
  );
}

/** 제안 수락/거절. 자기에게 온 제안만. 계약·정산은 플랫폼 밖에서 한다. */
export async function respondProposal(
  proposalId: UUID,
  personId: UUID,
  decision: 'ACCEPTED' | 'DECLINED'
): Promise<void> {
  const res = await query<{ id: UUID }>(
    `UPDATE sponsorship.proposal SET status = $3, decided_at = now()
      WHERE id = $1 AND athlete_person_id = $2 AND status IN ('SENT','VIEWED')
      RETURNING id`,
    [proposalId, personId, decision]
  );
  if (res.length === 0) throw new SponsorshipError('NOT_OWNER');
  await writeAudit({
    actorPersonId: personId, entitySchema: 'sponsorship', entityTable: 'proposal',
    entityId: proposalId, action: `PROPOSAL_${decision}`,
  });
}
