/**
 * 국가대표 선발·관리.
 *
 * 종목별 상설 대표팀 + 소집(callup) 단위로 후보 지명 → 자격 자동검증 → 확정 명단.
 * 지명 시 checkEligibility 결과를 스냅샷으로 저장해 "왜 뽑았나/왜 못 뽑나"를 남긴다.
 * 정지(SUSPENDED)된 선수는 checkEligibility 가 not_suspended=false 로 걸러 자동으로 부적격이 된다
 * (공정·윤리 신고의 징계 → 등록 SUSPENDED → 여기 반영, 모듈 간 일관성).
 */
import { query, queryOne, tx, writeAudit, issueCertificate, type UUID, type I18nText } from '@vsp/core-admin';
import { checkEligibility, type EligibilityResult } from './registration';

export type Gender = 'M' | 'F' | 'MIXED';
export type AgeClass = 'SENIOR' | 'U23' | 'U20' | 'YOUTH';
export type CallupType = 'SELECTION' | 'CAMP' | 'COMPETITION_ENTRY';
export type ApprovalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type CallupStatus = 'PLANNED' | 'OPEN' | 'FINALIZED' | 'CANCELLED';
export type SquadRole = 'ATHLETE' | 'COACH' | 'MANAGER' | 'MEDICAL' | 'RESERVE';
export type MemberStatus = 'NOMINATED' | 'SELECTED' | 'CONFIRMED' | 'DECLINED' | 'WITHDRAWN' | 'REPLACED';

type Actor = { personId?: UUID | null; orgId?: UUID | null };

// ── 대표팀 ────────────────────────────────────────────────────────────────

export interface NationalTeamRow {
  id: UUID; sport_id: UUID; sport_name: I18nText; discipline_id: UUID | null;
  governing_org_id: UUID | null; governing_org_name: I18nText | null;
  gender: Gender; age_class: AgeClass;
  head_coach_person_id: UUID | null; head_coach_name: string | null;
  name_i18n: I18nText; status: 'ACTIVE' | 'ARCHIVED'; callup_count: number;
}

export async function listNationalTeams(filter: { sportId?: UUID | null; status?: string | null } = {}): Promise<NationalTeamRow[]> {
  return query<NationalTeamRow>(
    `SELECT nt.id, nt.sport_id, s.name_i18n AS sport_name, nt.discipline_id,
            nt.governing_org_id, o.name_i18n AS governing_org_name,
            nt.gender, nt.age_class, nt.head_coach_person_id, hc.full_name AS head_coach_name,
            nt.name_i18n, nt.status,
            (SELECT count(*)::int FROM sport.nt_callup c WHERE c.national_team_id = nt.id) AS callup_count
       FROM sport.national_team nt
       JOIN sport.sport s ON s.id = nt.sport_id
       LEFT JOIN core.organization o ON o.id = nt.governing_org_id
       LEFT JOIN core.person hc ON hc.id = nt.head_coach_person_id
      WHERE ($1::uuid IS NULL OR nt.sport_id = $1)
        AND ($2::text IS NULL OR nt.status = $2)
      ORDER BY s.name_i18n->>'vi', nt.age_class, nt.gender`,
    [filter.sportId ?? null, filter.status ?? null]
  );
}

export async function getNationalTeam(id: UUID): Promise<NationalTeamRow | null> {
  const rows = await listNationalTeams({});
  return rows.find((t) => t.id === id) ?? null;
}

export interface CreateNationalTeamInput {
  sportId: UUID; disciplineId?: UUID | null; governingOrgId?: UUID | null;
  gender?: Gender; ageClass?: AgeClass; headCoachPersonId?: UUID | null; nameI18n: I18nText;
}
export async function createNationalTeam(input: CreateNationalTeamInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO sport.national_team
         (sport_id, discipline_id, governing_org_id, gender, age_class, head_coach_person_id, name_i18n)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
      [input.sportId, input.disciplineId ?? null, input.governingOrgId ?? null,
       input.gender ?? 'MIXED', input.ageClass ?? 'SENIOR', input.headCoachPersonId ?? null,
       JSON.stringify(input.nameI18n)]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'national_team', entityId: row.id,
        action: 'INSERT', after: { sport: input.sportId, age_class: input.ageClass ?? 'SENIOR' } },
      client
    );
    return row.id;
  });
}

// ── 소집 ──────────────────────────────────────────────────────────────────

export interface CallupRow {
  id: UUID; national_team_id: UUID; team_name: I18nText; sport_name: I18nText;
  season_id: UUID; season_name: I18nText | null;
  target_competition_name_i18n: I18nText | null; callup_type: CallupType;
  approval_status: ApprovalStatus; approved_at: string | null; decision_no: string | null;
  quota: number | null; venue_text: string | null; starts_on: string | null; ends_on: string | null;
  status: CallupStatus; confirmed_count: number; nominated_count: number;
}

export async function listCallups(filter: { nationalTeamId?: UUID | null } = {}): Promise<CallupRow[]> {
  return query<CallupRow>(
    `SELECT c.id, c.national_team_id, nt.name_i18n AS team_name, s.name_i18n AS sport_name,
            c.season_id, se.name_i18n AS season_name,
            c.target_competition_name_i18n, c.callup_type, c.approval_status, c.approved_at::text AS approved_at,
            c.decision_no, c.quota, c.venue_text, c.starts_on::text AS starts_on, c.ends_on::text AS ends_on, c.status,
            (SELECT count(*)::int FROM sport.nt_member m WHERE m.callup_id = c.id AND m.member_status = 'CONFIRMED') AS confirmed_count,
            (SELECT count(*)::int FROM sport.nt_member m WHERE m.callup_id = c.id) AS nominated_count
       FROM sport.nt_callup c
       JOIN sport.national_team nt ON nt.id = c.national_team_id
       JOIN sport.sport s ON s.id = nt.sport_id
       LEFT JOIN core.season se ON se.id = c.season_id
      WHERE ($1::uuid IS NULL OR c.national_team_id = $1)
      ORDER BY c.starts_on DESC NULLS LAST, c.created_at DESC`,
    [filter.nationalTeamId ?? null]
  );
}

export async function getCallup(id: UUID): Promise<CallupRow | null> {
  const rows = await query<CallupRow>(
    `SELECT c.id, c.national_team_id, nt.name_i18n AS team_name, s.name_i18n AS sport_name,
            c.season_id, se.name_i18n AS season_name,
            c.target_competition_name_i18n, c.callup_type, c.approval_status, c.approved_at::text AS approved_at,
            c.decision_no, c.quota, c.venue_text, c.starts_on::text AS starts_on, c.ends_on::text AS ends_on, c.status,
            (SELECT count(*)::int FROM sport.nt_member m WHERE m.callup_id = c.id AND m.member_status = 'CONFIRMED') AS confirmed_count,
            (SELECT count(*)::int FROM sport.nt_member m WHERE m.callup_id = c.id) AS nominated_count
       FROM sport.nt_callup c
       JOIN sport.national_team nt ON nt.id = c.national_team_id
       JOIN sport.sport s ON s.id = nt.sport_id
       LEFT JOIN core.season se ON se.id = c.season_id
      WHERE c.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export interface CreateCallupInput {
  nationalTeamId: UUID; seasonId: UUID; callupType?: CallupType;
  targetCompetitionNameI18n?: I18nText | null; targetEventId?: UUID | null;
  quota?: number | null; venueText?: string | null; startsOn?: string | null; endsOn?: string | null;
  submissionId?: UUID | null;
}
export async function createCallup(input: CreateCallupInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO sport.nt_callup
         (national_team_id, season_id, target_event_id, target_competition_name_i18n, callup_type,
          submission_id, approval_status, quota, venue_text, starts_on, ends_on, status)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,
               CASE WHEN $6::uuid IS NULL THEN 'DRAFT' ELSE 'SUBMITTED' END,
               $7,$8,$9,$10,'PLANNED')
       RETURNING id`,
      [input.nationalTeamId, input.seasonId, input.targetEventId ?? null,
       input.targetCompetitionNameI18n ? JSON.stringify(input.targetCompetitionNameI18n) : null,
       input.callupType ?? 'SELECTION', input.submissionId ?? null,
       input.quota ?? null, input.venueText ?? null, input.startsOn ?? null, input.endsOn ?? null]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'nt_callup', entityId: row.id,
        action: 'INSERT', after: { team: input.nationalTeamId, type: input.callupType ?? 'SELECTION' } },
      client
    );
    return row.id;
  });
}

/** 소집 개최/선발 승인 확정 — approval APPROVED, 명단 접수를 여는 OPEN. */
export async function approveCallup(callupId: UUID, decisionNo: string | null, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE sport.nt_callup
          SET approval_status='APPROVED', approved_at=now(), decision_no=$2,
              status = CASE WHEN status='PLANNED' THEN 'OPEN' ELSE status END, updated_at=now()
        WHERE id=$1`,
      [callupId, decisionNo]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'nt_callup', entityId: callupId,
        action: 'APPROVE', after: { decision_no: decisionNo } },
      client
    );
  });
}

// ── 명단 ──────────────────────────────────────────────────────────────────

export interface SquadMemberRow {
  id: UUID; person_id: UUID; full_name: string; name_latin: string | null;
  squad_role: SquadRole; nomination_source: string; eval_score: string | null; rank_no: number | null;
  eligibility_check: EligibilityResult | null; member_status: MemberStatus; jersey_no: string | null; note: string | null;
  verify_code: string | null;
}

export async function listSquad(callupId: UUID): Promise<SquadMemberRow[]> {
  return query<SquadMemberRow>(
    `SELECT m.id, m.person_id, p.full_name, p.name_latin,
            m.squad_role, m.nomination_source, m.eval_score::text AS eval_score, m.rank_no,
            m.eligibility_check, m.member_status, m.jersey_no, m.note, m.verify_code
       FROM sport.nt_member m
       JOIN core.person p ON p.id = m.person_id
      WHERE m.callup_id = $1
      ORDER BY
        CASE m.squad_role WHEN 'ATHLETE' THEN 0 WHEN 'RESERVE' THEN 1 ELSE 2 END,
        m.rank_no NULLS LAST, p.full_name`,
    [callupId]
  );
}

export interface NominateInput {
  callupId: UUID; personId: UUID; squadRole?: SquadRole; nominationSource?: string; note?: string | null;
}
/** 후보 지명 — 선수/예비면 checkEligibility 스냅샷을 함께 저장한다. */
export async function nominateMember(input: NominateInput, actor: Actor = {}): Promise<UUID | null> {
  // 읽기(자격검증·등록조회)는 트랜잭션 밖에서 먼저 한다.
  // checkEligibility 가 별도 커넥션을 잡으므로, tx 안에서 부르면 단일커넥션 개발 DB(pglite-server)에서 교착한다.
  const ctx = await queryOne<{ season_id: UUID; sport_id: UUID }>(
    `SELECT c.season_id, nt.sport_id
       FROM sport.nt_callup c JOIN sport.national_team nt ON nt.id = c.national_team_id
      WHERE c.id = $1`,
    [input.callupId]
  );
  if (!ctx) throw new Error('callup not found');

  const role = input.squadRole ?? 'ATHLETE';
  let eligibility: EligibilityResult | null = null;
  let registrationId: UUID | null = null;
  if (role === 'ATHLETE' || role === 'RESERVE') {
    eligibility = await checkEligibility(input.personId, ctx.sport_id, ctx.season_id);
    registrationId = (await queryOne<{ id: UUID }>(
      `SELECT id FROM sport.registration
        WHERE person_id=$1 AND sport_id=$2 AND season_id=$3 AND reg_type='ATHLETE' LIMIT 1`,
      [input.personId, ctx.sport_id, ctx.season_id]
    ))?.id ?? null;
  }

  return tx(async (client) => {
    const res = await client.query<{ id: UUID }>(
      `INSERT INTO sport.nt_member
         (callup_id, person_id, registration_id, squad_role, nomination_source, eligibility_check, note)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (callup_id, person_id) DO NOTHING
       RETURNING id`,
      [input.callupId, input.personId, registrationId, role,
       input.nominationSource ?? 'DISCRETIONARY', eligibility ? JSON.stringify(eligibility) : null, input.note ?? null]
    );
    const id = res.rows[0]?.id ?? null;
    if (id) {
      await writeAudit(
        { actorPersonId: actor.personId, actorOrgId: actor.orgId,
          entitySchema: 'sport', entityTable: 'nt_member', entityId: id,
          action: 'NOMINATE', after: { person: input.personId, role, eligible: eligibility?.eligible ?? null } },
        client
      );
    }
    return id;
  });
}

const MEMBER_STATUSES: MemberStatus[] = ['NOMINATED', 'SELECTED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN', 'REPLACED'];
export async function setMemberStatus(memberId: UUID, status: MemberStatus, actor: Actor = {}): Promise<void> {
  if (!MEMBER_STATUSES.includes(status)) throw new Error('invalid member status');
  await tx(async (client) => {
    const before = (await client.query<{ member_status: string }>(
      `SELECT member_status FROM sport.nt_member WHERE id=$1`, [memberId]
    )).rows[0];
    await client.query(
      `UPDATE sport.nt_member SET member_status=$2, decided_at=now() WHERE id=$1`, [memberId, status]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'nt_member', entityId: memberId,
        action: 'MEMBER_STATUS', before: before ?? null, after: { member_status: status } },
      client
    );
  });
}

export async function recordEvaluation(
  memberId: UUID, input: { score?: number | null; rankNo?: number | null }, actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE sport.nt_member SET eval_score=$2, rank_no=$3 WHERE id=$1`,
      [memberId, input.score ?? null, input.rankNo ?? null]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'nt_member', entityId: memberId,
        action: 'EVALUATE', after: { score: input.score ?? null, rank_no: input.rankNo ?? null } },
      client
    );
  });
}

export class QuotaExceededError extends Error {
  constructor(public quota: number, public count: number) { super('QUOTA_EXCEEDED'); }
}

/** 명단 확정 — SELECTED 를 CONFIRMED 로 일괄 전환하고 소집을 FINALIZED 로. 정원 초과면 막는다. */
export async function finalizeSquad(callupId: UUID, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    const c = (await client.query<{ quota: number | null }>(
      `SELECT quota FROM sport.nt_callup WHERE id=$1`, [callupId]
    )).rows[0];
    const willConfirm = (await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sport.nt_member
        WHERE callup_id=$1 AND member_status IN ('SELECTED','CONFIRMED') AND squad_role IN ('ATHLETE','RESERVE')`,
      [callupId]
    )).rows[0];
    const count = Number(willConfirm?.n ?? 0);
    if (c?.quota != null && count > c.quota) throw new QuotaExceededError(c.quota, count);

    await client.query(
      `UPDATE sport.nt_member SET member_status='CONFIRMED', decided_at=now()
        WHERE callup_id=$1 AND member_status='SELECTED'`,
      [callupId]
    );
    await client.query(
      `UPDATE sport.nt_callup SET status='FINALIZED', updated_at=now() WHERE id=$1`, [callupId]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'nt_callup', entityId: callupId,
        action: 'FINALIZE', after: { confirmed: count } },
      client
    );
  });

  // 국가대표 확인서 발급(진위확인 코드) — 확정 선수 중 아직 미발급자에게. 별도 트랜잭션.
  const toCertify = await query<{ id: UUID; person_id: UUID }>(
    `SELECT id, person_id FROM sport.nt_member
      WHERE callup_id=$1 AND member_status='CONFIRMED' AND squad_role IN ('ATHLETE','RESERVE') AND cert_document_id IS NULL`,
    [callupId]
  );
  for (const m of toCertify) {
    try {
      const cert = await issueCertificate(
        { personId: m.person_id, orgId: actor.orgId ?? null, certType: 'NATIONAL_TEAM',
          title: 'Xác nhận đội tuyển quốc gia · 국가대표 확인서' },
        actor
      );
      await query(`UPDATE sport.nt_member SET cert_document_id=$2, verify_code=$3 WHERE id=$1`, [m.id, cert.id, cert.verify_code]);
    } catch { /* 발급 실패는 확정을 막지 않는다 */ }
  }
}

// ── 개인 이력 (/my · 선수 프로필용) ──────────────────────────────────────
export interface PersonCallupRow {
  callup_id: UUID; team_name: I18nText; sport_name: I18nText; age_class: AgeClass;
  competition_name_i18n: I18nText | null; squad_role: SquadRole; member_status: MemberStatus;
  starts_on: string | null;
}
export async function listPersonCallups(personId: UUID): Promise<PersonCallupRow[]> {
  return query<PersonCallupRow>(
    `SELECT c.id AS callup_id, nt.name_i18n AS team_name, s.name_i18n AS sport_name, nt.age_class,
            c.target_competition_name_i18n AS competition_name_i18n, m.squad_role, m.member_status,
            c.starts_on::text AS starts_on
       FROM sport.nt_member m
       JOIN sport.nt_callup c ON c.id = m.callup_id
       JOIN sport.national_team nt ON nt.id = c.national_team_id
       JOIN sport.sport s ON s.id = nt.sport_id
      WHERE m.person_id = $1
      ORDER BY c.starts_on DESC NULLS LAST`,
    [personId]
  );
}
