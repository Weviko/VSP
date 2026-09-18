/**
 * 경기인 등록.
 * 6개 유형: 선수 / 지도자 / 심판 / 선수관리담당자 / 임원·직원 / 훈련센터 관계자.
 * 연간 갱신제이며, 승인은 core의 결재 엔진이 처리한다.
 */
import { query, queryOne, tx, writeAudit, type UUID, type I18nText } from '@vsp/core-admin';
import type { RegType } from './labels';

// 이름표는 DB 에 의존하지 않는 모듈로 분리했다. 대외 웹사이트가 쓰기 함수 없이 가져갈 수 있게.
export { REG_TYPES, REG_TYPE_LABELS, type RegType } from './labels';

export interface Registration {
  id: UUID;
  person_id: UUID;
  season_id: UUID;
  sport_id: UUID;
  reg_type: RegType;
  team_id: UUID | null;
  org_id: UUID;
  submission_id: UUID | null;
  primary_discipline_id: UUID | null;
  jersey_no: string | null;
  height_cm: string | null;
  weight_kg: string | null;
  license_grade: string | null;
  license_no: string | null;
  license_expires_on: string | null;
  eligibility: Record<string, unknown>;
  status: string;
  approved_at: string | null;
  card_issued_at: string | null;
}

export interface RegistrationRow extends Registration {
  full_name: string;
  birth_date: string | null;
  gender: string | null;
  photo_url: string | null;
  org_name: I18nText;
  sport_name: I18nText;
}

export async function listRegistrations(filter: {
  orgId?: UUID | null;
  sportId?: UUID | null;
  seasonId?: UUID | null;
  regType?: RegType | null;
  status?: string | null;
  /** 한 사람의 등록만 — 회원 서비스의 "내 등록" */
  personId?: UUID | null;
  limit?: number;
}): Promise<RegistrationRow[]> {
  return query<RegistrationRow>(
    `SELECT r.*, p.full_name, p.birth_date, p.gender, p.photo_url,
            o.name_i18n AS org_name, s.name_i18n AS sport_name
       FROM sport.registration r
       JOIN core.person p ON p.id = r.person_id
       JOIN core.organization o ON o.id = r.org_id
       JOIN sport.sport s ON s.id = r.sport_id
      WHERE ($1::uuid IS NULL OR r.org_id = $1)
        AND ($2::uuid IS NULL OR r.sport_id = $2)
        AND ($3::uuid IS NULL OR r.season_id = $3)
        AND ($4::text IS NULL OR r.reg_type = $4)
        AND ($5::text IS NULL OR r.status = $5)
        AND ($7::uuid IS NULL OR r.person_id = $7)
      ORDER BY r.created_at DESC
      LIMIT $6`,
    [
      filter.orgId ?? null, filter.sportId ?? null, filter.seasonId ?? null,
      filter.regType ?? null, filter.status ?? null, filter.limit ?? 100,
      filter.personId ?? null,
    ]
  );
}

/** 등록 한 건 (사람·종목·단체 이름 포함). 처리 화면용. */
export async function getRegistration(id: UUID): Promise<RegistrationRow | null> {
  return queryOne<RegistrationRow>(
    `SELECT r.*, p.full_name, p.birth_date, p.gender, p.photo_url,
            o.name_i18n AS org_name, s.name_i18n AS sport_name
       FROM sport.registration r
       JOIN core.person p ON p.id = r.person_id
       JOIN core.organization o ON o.id = r.org_id
       JOIN sport.sport s ON s.id = r.sport_id
      WHERE r.id = $1`,
    [id]
  );
}

/** 반려 — 자격 미달·서류 부적합. 등록으로 확정하지 않는다. 사유는 감사기록에 남긴다(신청자 설명·분쟁 근거). */
export async function rejectRegistration(
  registrationId: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {},
  reason?: string | null
): Promise<void> {
  await tx(async (client) => {
    const before = (
      await client.query<Registration>(`SELECT * FROM sport.registration WHERE id=$1`, [registrationId])
    ).rows[0];
    await client.query(
      `UPDATE sport.registration SET status='REJECTED', updated_at=now() WHERE id=$1`,
      [registrationId]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'registration', entityId: registrationId,
        action: 'REJECT', before, after: { status: 'REJECTED', reason: reason ?? null },
        note: reason ?? null,
      },
      client
    );
  });
}

/**
 * 출전 자격 검증.
 * 등록 승인 + 교육 이수 + 징계 + 미납을 한 번에 확인한다.
 * 대회 참가 신청 시 자동으로 돌려 자격 미달을 사전에 걸러낸다.
 */
export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  checks: Record<string, boolean>;
}

export async function checkEligibility(
  personId: UUID,
  sportId: UUID,
  seasonId: UUID,
  opts: { requireEducation?: boolean; requirePayment?: boolean } = {}
): Promise<EligibilityResult> {
  const reg = await queryOne<Registration>(
    `SELECT * FROM sport.registration
      WHERE person_id=$1 AND sport_id=$2 AND season_id=$3 AND reg_type='ATHLETE'`,
    [personId, sportId, seasonId]
  );

  const checks: Record<string, boolean> = {
    registered: Boolean(reg),
    approved: reg?.status === 'APPROVED',
    not_suspended: reg?.status !== 'SUSPENDED',
  };
  const reasons: string[] = [];
  if (!checks.registered) reasons.push('NOT_REGISTERED');
  else if (!checks.approved) reasons.push('NOT_APPROVED');
  if (!checks.not_suspended) reasons.push('SUSPENDED');

  // 교육 이수 게이트 (체육회가 콘텐츠를 제공하면 활성화)
  if (opts.requireEducation) {
    const e = (reg?.eligibility ?? {}) as Record<string, unknown>;
    checks.antidoping = Boolean(e.antidoping);
    checks.safeguarding = Boolean(e.safeguarding);
    if (!checks.antidoping) reasons.push('ANTIDOPING_EDUCATION_MISSING');
    if (!checks.safeguarding) reasons.push('SAFEGUARDING_EDUCATION_MISSING');
  }

  // 미납 확인 — 협회가 자동 차단을 켠 경우에만 막는다
  if (opts.requirePayment && reg) {
    const unpaid = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM core.payment_order
        WHERE payer_person_id=$1 AND ref_type='REGISTRATION'
          AND status IN ('PENDING','FAILED')`,
      [personId]
    );
    checks.paid = (unpaid?.n ?? 0) === 0;
    if (!checks.paid) reasons.push('UNPAID_FEE');
  }

  return { eligible: reasons.length === 0, reasons, checks };
}

/** 결재 승인이 끝난 신청서를 실제 등록으로 확정한다 */
export async function approveRegistration(
  registrationId: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (
      await client.query<Registration>(`SELECT * FROM sport.registration WHERE id=$1`, [registrationId])
    ).rows[0];

    await client.query(
      `UPDATE sport.registration
          SET status='APPROVED', approved_at=now(), updated_at=now()
        WHERE id=$1`,
      [registrationId]
    );

    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'registration', entityId: registrationId,
        action: 'APPROVE', before, after: { status: 'APPROVED' },
      },
      client
    );
  });
}
