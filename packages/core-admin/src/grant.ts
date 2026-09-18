/**
 * 보조금 전 주기.
 *
 * 한국 e나라도움의 흐름을 옮긴다:
 *   공모등록 → 신청 → 선정 → 교부결정 → 집행 → 정산 → 검사 → 공시
 *
 * 정부가 시스템을 볼 때 가장 먼저 확인하는 것이 돈의 흐름이다.
 * 그래서 두 가지를 특히 신경 썼다.
 *   1) 중앙 → 지방 → 단체 → 최종 집행까지 계층으로 추적한다
 *   2) 재원(국가/지방/자부담/후원)을 집행 한 건 단위로 구분한다
 */
import { createHash } from 'node:crypto';
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type FundSource = 'STATE_BUDGET' | 'PROVINCE' | 'SELF' | 'SPONSOR' | 'MEMBERSHIP';

export const FUND_SOURCE_LABELS: Record<FundSource, I18nText> = {
  STATE_BUDGET: { vi: 'Ngân sách nhà nước', en: 'State budget', ko: '국가지원' },
  PROVINCE: { vi: 'Ngân sách tỉnh', en: 'Provincial budget', ko: '지방비' },
  SELF: { vi: 'Vốn tự có', en: 'Self funding', ko: '자부담' },
  SPONSOR: { vi: 'Tài trợ', en: 'Sponsorship', ko: '후원금' },
  MEMBERSHIP: { vi: 'Phí hội viên', en: 'Membership fee', ko: '회비' },
};

export interface Program {
  id: UUID;
  code: string | null;
  name_i18n: I18nText;
  owner_org_id: UUID;
  fiscal_year: number;
  program_type: string;
  total_budget: string | null;
  currency: string;
  applies_from: string | null;
  applies_to: string | null;
  application_form_code: string | null;
  status: string;
}

export interface Award {
  id: UUID;
  program_id: UUID;
  application_id: UUID | null;
  parent_award_id: UUID | null;
  grantee_org_id: UUID;
  decision_no: string | null;
  awarded_amount: string;
  self_funding: string;
  currency: string;
  dedicated_account: string | null;
  starts_on: string | null;
  ends_on: string | null;
  settlement_due_on: string | null;
  status: string;
  decided_at: string;
  paid_at: string | null;
}

// ── 공모 ────────────────────────────────────────────────────────────

export async function listPrograms(filter: {
  ownerOrgId?: UUID | null;
  fiscalYear?: number | null;
  status?: string | null;
} = {}): Promise<Array<Program & { application_count: number; awarded_total: string }>> {
  return query(
    `SELECT p.*,
            (SELECT count(*)::int FROM grant_mgmt.application a WHERE a.program_id = p.id) AS application_count,
            COALESCE((SELECT sum(w.awarded_amount) FROM grant_mgmt.award w WHERE w.program_id = p.id), 0)::text AS awarded_total
       FROM grant_mgmt.program p
      WHERE ($1::uuid IS NULL OR p.owner_org_id = $1)
        AND ($2::int IS NULL OR p.fiscal_year = $2)
        AND ($3::text IS NULL OR p.status = $3)
      ORDER BY p.fiscal_year DESC, p.created_at DESC`,
    [filter.ownerOrgId ?? null, filter.fiscalYear ?? null, filter.status ?? null]
  );
}

export interface CreateProgramInput {
  code?: string | null;
  nameI18n: I18nText;
  ownerOrgId: UUID;
  fiscalYear: number;
  totalBudget?: number | null;
  appliesFrom?: string | null;
  appliesTo?: string | null;
  applicationFormCode?: string | null;
  programType?: 'OPEN_CALL' | 'DESIGNATED';
}

export async function createProgram(
  input: CreateProgramInput,
  actor: { personId?: UUID | null } = {}
): Promise<Program> {
  return tx(async (client) => {
    const res = await client.query<Program>(
      `INSERT INTO grant_mgmt.program
         (code, name_i18n, owner_org_id, fiscal_year, program_type,
          total_budget, applies_from, applies_to, application_form_code, status)
       VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,'DRAFT')
       RETURNING *`,
      [
        input.code ?? null,
        JSON.stringify(input.nameI18n),
        input.ownerOrgId,
        input.fiscalYear,
        input.programType ?? 'OPEN_CALL',
        input.totalBudget ?? null,
        input.appliesFrom ?? null,
        input.appliesTo ?? null,
        input.applicationFormCode ?? null,
      ]
    );
    const p = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: input.ownerOrgId,
        entitySchema: 'grant_mgmt',
        entityTable: 'program',
        entityId: p.id,
        action: 'INSERT',
        after: { name: input.nameI18n, fiscal_year: input.fiscalYear },
      },
      client
    );
    return p;
  });
}

export async function setProgramStatus(programId: UUID, status: string): Promise<void> {
  await query(`UPDATE grant_mgmt.program SET status=$2, updated_at=now() WHERE id=$1`, [
    programId,
    status,
  ]);
}

// ── 신청 ────────────────────────────────────────────────────────────

export async function applyToProgram(input: {
  programId: UUID;
  applicantOrgId: UUID;
  requestedAmount: number;
  selfFunding?: number;
  summary?: string | null;
  submissionId?: UUID | null;
}): Promise<UUID> {
  const rows = await query<{ id: UUID }>(
    `INSERT INTO grant_mgmt.application
       (program_id, applicant_org_id, requested_amount, self_funding, summary, submission_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (program_id, applicant_org_id) DO UPDATE SET
       requested_amount = EXCLUDED.requested_amount,
       self_funding = EXCLUDED.self_funding,
       summary = EXCLUDED.summary
     RETURNING id`,
    [
      input.programId,
      input.applicantOrgId,
      input.requestedAmount,
      input.selfFunding ?? 0,
      input.summary ?? null,
      input.submissionId ?? null,
    ]
  );
  return rows[0].id;
}

export async function listApplications(programId: UUID) {
  return query<{
    id: UUID;
    applicant_org_id: UUID;
    org_name: I18nText;
    requested_amount: string;
    self_funding: string;
    score: string | null;
    status: string;
    submitted_at: string;
  }>(
    `SELECT a.id, a.applicant_org_id, o.name_i18n AS org_name,
            a.requested_amount, a.self_funding, a.score, a.status, a.submitted_at
       FROM grant_mgmt.application a
       JOIN core.organization o ON o.id = a.applicant_org_id
      WHERE a.program_id = $1
      ORDER BY a.score DESC NULLS LAST, a.submitted_at`,
    [programId]
  );
}

// ── 교부 ────────────────────────────────────────────────────────────

export interface AwardInput {
  programId: UUID;
  applicationId?: UUID | null;
  parentAwardId?: UUID | null;
  granteeOrgId: UUID;
  decisionNo?: string | null;
  awardedAmount: number;
  selfFunding?: number;
  dedicatedAccount?: string | null;
  bankName?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  settlementDueOn?: string | null;
}

export class OverAwardError extends Error {
  constructor(public requested: number, public available: number) {
    super(`award ${requested} exceeds remaining ${available}`);
  }
}

/**
 * 교부 결정.
 *
 * 재교부(parent_award_id 지정)일 때는 상위 교부액을 넘길 수 없다.
 * 이 검증이 없으면 중앙에서 100을 받아 지방에 150을 내려보내는 일이 가능해진다.
 */
export async function decideAward(
  input: AwardInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<Award> {
  return tx(async (client) => {
    if (input.parentAwardId) {
      const parent = (
        await client.query<{ awarded_amount: string }>(
          `SELECT awarded_amount FROM grant_mgmt.award WHERE id = $1`,
          [input.parentAwardId]
        )
      ).rows[0];
      if (!parent) throw new Error('parent award not found');

      const used = (
        await client.query<{ total: string }>(
          `SELECT COALESCE(sum(awarded_amount), 0)::text AS total
             FROM grant_mgmt.award WHERE parent_award_id = $1 AND status <> 'CANCELLED'`,
          [input.parentAwardId]
        )
      ).rows[0];

      const available = Number(parent.awarded_amount) - Number(used.total);
      if (input.awardedAmount > available) {
        throw new OverAwardError(input.awardedAmount, available);
      }
    }

    const res = await client.query<Award>(
      `INSERT INTO grant_mgmt.award
         (program_id, application_id, parent_award_id, grantee_org_id, decision_no,
          awarded_amount, self_funding, dedicated_account, bank_name,
          starts_on, ends_on, settlement_due_on, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'DECIDED')
       RETURNING *`,
      [
        input.programId,
        input.applicationId ?? null,
        input.parentAwardId ?? null,
        input.granteeOrgId,
        input.decisionNo ?? null,
        input.awardedAmount,
        input.selfFunding ?? 0,
        input.dedicatedAccount ?? null,
        input.bankName ?? null,
        input.startsOn ?? null,
        input.endsOn ?? null,
        input.settlementDueOn ?? null,
      ]
    );
    const award = res.rows[0];

    if (input.applicationId) {
      await client.query(
        `UPDATE grant_mgmt.application SET status='SELECTED', decided_at=now() WHERE id=$1`,
        [input.applicationId]
      );
    }

    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'grant_mgmt',
        entityTable: 'award',
        entityId: award.id,
        action: 'AWARD',
        after: {
          grantee: input.granteeOrgId,
          amount: input.awardedAmount,
          decision_no: input.decisionNo,
        },
      },
      client
    );
    return award;
  });
}

export async function listAwards(filter: {
  granteeOrgId?: UUID | null;
  programId?: UUID | null;
  status?: string | null;
} = {}) {
  return query<
    Award & {
      org_name: I18nText;
      program_name: I18nText;
      executed_amount: string;
      execution_rate: number;
      overdue: boolean;
    }
  >(
    `SELECT w.*, o.name_i18n AS org_name, p.name_i18n AS program_name,
            COALESCE((SELECT sum(e.amount) FROM grant_mgmt.execution e WHERE e.award_id = w.id), 0)::text AS executed_amount,
            CASE WHEN w.awarded_amount > 0
                 THEN round(COALESCE((SELECT sum(e.amount) FROM grant_mgmt.execution e WHERE e.award_id = w.id), 0)
                            / w.awarded_amount * 100)::int
                 ELSE 0 END AS execution_rate,
            (w.settlement_due_on IS NOT NULL AND w.settlement_due_on < CURRENT_DATE
             AND w.status <> 'CLOSED') AS overdue
       FROM grant_mgmt.award w
       JOIN core.organization o ON o.id = w.grantee_org_id
       JOIN grant_mgmt.program p ON p.id = w.program_id
      WHERE ($1::uuid IS NULL OR w.grantee_org_id = $1)
        AND ($2::uuid IS NULL OR w.program_id = $2)
        AND ($3::text IS NULL OR w.status = $3)
      ORDER BY overdue DESC, w.decided_at DESC`,
    [filter.granteeOrgId ?? null, filter.programId ?? null, filter.status ?? null]
  );
}

/** 교부 계층 — 중앙에서 내려간 돈이 최종적으로 어디까지 갔는지 */
export async function getAwardChain(rootAwardId: UUID) {
  return query<{
    id: UUID;
    depth: number;
    org_name: I18nText;
    awarded_amount: string;
    executed_amount: string;
    status: string;
  }>(
    `SELECT d.id, d.depth, o.name_i18n AS org_name, w.awarded_amount, w.status,
            COALESCE((SELECT sum(e.amount) FROM grant_mgmt.execution e WHERE e.award_id = w.id), 0)::text AS executed_amount
       FROM grant_mgmt.award_descendants($1) d
       JOIN grant_mgmt.award w ON w.id = d.id
       JOIN core.organization o ON o.id = w.grantee_org_id
      ORDER BY d.depth, o.name_i18n->>'vi'`,
    [rootAwardId]
  );
}

// ── 집행 ────────────────────────────────────────────────────────────

export interface ExecutionInput {
  awardId: UUID;
  budgetItemId?: UUID | null;
  executedOn: string;
  amount: number;
  fundSource: FundSource;
  payee?: string | null;
  description?: string | null;
  evidenceNo?: string | null;
}

export class DuplicateEvidenceError extends Error {
  constructor(public evidenceNo: string, public otherAwardId: UUID) {
    super(`evidence ${evidenceNo} already used in another award`);
  }
}

export class OverExecutionError extends Error {
  constructor(public requested: number, public available: number) {
    super(`execution ${requested} exceeds remaining ${available}`);
  }
}

/** 증빙번호를 해시한다. 원본을 그대로 두면 유출 시 거래처 정보가 드러난다. */
function hashEvidence(programId: UUID, evidenceNo: string): string {
  return createHash('sha256').update(`${programId}:${evidenceNo.trim()}`).digest('hex');
}

/**
 * 집행 기록.
 *
 * 두 가지를 막는다.
 *  1) 교부액 초과 집행
 *  2) 같은 증빙을 여러 사업에 중복 사용 — 부정수급의 대표 유형이다
 */
export async function recordExecution(
  input: ExecutionInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<UUID> {
  return tx(async (client) => {
    const award = (
      await client.query<{ awarded_amount: string; self_funding: string; program_id: UUID }>(
        `SELECT awarded_amount, self_funding, program_id FROM grant_mgmt.award WHERE id=$1`,
        [input.awardId]
      )
    ).rows[0];
    if (!award) throw new Error('award not found');

    // 자부담은 교부액과 별도 한도다
    const isSelf = input.fundSource === 'SELF';
    const cap = Number(isSelf ? award.self_funding : award.awarded_amount);

    const used = (
      await client.query<{ total: string }>(
        `SELECT COALESCE(sum(amount), 0)::text AS total
           FROM grant_mgmt.execution
          WHERE award_id = $1 AND (fund_source = 'SELF') = $2`,
        [input.awardId, isSelf]
      )
    ).rows[0];

    const available = cap - Number(used.total);
    if (input.amount > available) throw new OverExecutionError(input.amount, available);

    let evidenceHash: string | null = null;
    if (input.evidenceNo) {
      evidenceHash = hashEvidence(award.program_id, input.evidenceNo);
      const dup = (
        await client.query<{ award_id: UUID }>(
          `SELECT award_id FROM grant_mgmt.execution
            WHERE evidence_hash = $1 AND award_id <> $2 LIMIT 1`,
          [evidenceHash, input.awardId]
        )
      ).rows[0];
      if (dup) throw new DuplicateEvidenceError(input.evidenceNo, dup.award_id);
    }

    const res = await client.query<{ id: UUID }>(
      `INSERT INTO grant_mgmt.execution
         (award_id, budget_item_id, executed_on, amount, fund_source,
          payee, description, evidence_no, evidence_hash, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        input.awardId, input.budgetItemId ?? null, input.executedOn, input.amount,
        input.fundSource, input.payee ?? null, input.description ?? null,
        input.evidenceNo ?? null, evidenceHash, actor.personId ?? null,
      ]
    );

    await client.query(
      `UPDATE grant_mgmt.award SET status='EXECUTING' WHERE id=$1 AND status IN ('DECIDED','PAID')`,
      [input.awardId]
    );

    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'grant_mgmt', entityTable: 'execution', entityId: res.rows[0].id,
        action: 'EXECUTE',
        after: { award_id: input.awardId, amount: input.amount, fund_source: input.fundSource },
      },
      client
    );
    return res.rows[0].id;
  });
}

/** 재원별 집행 현황 — 정산보고서의 기본 표 */
export async function getExecutionByFundSource(awardId: UUID) {
  return query<{ fund_source: FundSource; executed: string; cnt: number }>(
    `SELECT e.fund_source,
            COALESCE(sum(e.amount), 0)::text AS executed,
            count(*)::int AS cnt
       FROM grant_mgmt.execution e
      WHERE e.award_id = $1
      GROUP BY e.fund_source
      ORDER BY e.fund_source`,
    [awardId]
  );
}

// ── 정산 · 검사 ─────────────────────────────────────────────────────

/**
 * 정산 제출.
 * 집행 합계를 시스템이 계산하므로 단체가 숫자를 임의로 적을 수 없다.
 * 잔액은 반납 또는 이월로 처리한다.
 */
export async function submitSettlement(
  awardId: UUID,
  opts: { returnedAmount?: number; carriedOverAmount?: number; submissionId?: UUID | null } = {},
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<{ executed: number; remaining: number }> {
  return tx(async (client) => {
    const award = (
      await client.query<{ awarded_amount: string }>(
        `SELECT awarded_amount FROM grant_mgmt.award WHERE id=$1`, [awardId]
      )
    ).rows[0];
    if (!award) throw new Error('award not found');

    const exec = (
      await client.query<{ total: string }>(
        `SELECT COALESCE(sum(amount),0)::text AS total FROM grant_mgmt.execution
          WHERE award_id=$1 AND fund_source <> 'SELF'`,
        [awardId]
      )
    ).rows[0];

    const awarded = Number(award.awarded_amount);
    const executed = Number(exec.total);
    const remaining = awarded - executed;

    await client.query(
      `INSERT INTO grant_mgmt.settlement
         (award_id, submission_id, reported_amount, executed_amount, remaining_amount,
          returned_amount, carried_over_amount, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SUBMITTED',now())
       ON CONFLICT (award_id) DO UPDATE SET
         reported_amount = EXCLUDED.reported_amount,
         executed_amount = EXCLUDED.executed_amount,
         remaining_amount = EXCLUDED.remaining_amount,
         returned_amount = EXCLUDED.returned_amount,
         carried_over_amount = EXCLUDED.carried_over_amount,
         status = 'SUBMITTED', submitted_at = now()`,
      [
        awardId, opts.submissionId ?? null, awarded, executed, remaining,
        opts.returnedAmount ?? 0, opts.carriedOverAmount ?? 0,
      ]
    );

    await client.query(`UPDATE grant_mgmt.award SET status='SETTLING' WHERE id=$1`, [awardId]);

    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'grant_mgmt', entityTable: 'settlement', entityId: awardId,
        action: 'SETTLE', after: { executed, remaining },
      },
      client
    );
    return { executed, remaining };
  });
}

/** 검사 — 통과 시 교부건을 종결하고 공시 대상으로 만든다 */
export async function inspectSettlement(
  awardId: UUID,
  input: { result: 'PASS' | 'CONDITIONAL' | 'FAIL'; findings?: string; recoveryAmount?: number },
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const st = (
      await client.query<{ id: UUID }>(
        `SELECT id FROM grant_mgmt.settlement WHERE award_id=$1`, [awardId]
      )
    ).rows[0];
    if (!st) throw new Error('settlement not found');

    await client.query(
      `INSERT INTO grant_mgmt.inspection
         (settlement_id, inspector_org_id, inspector_person_id, result, findings, recovery_amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        st.id, actor.orgId ?? null, actor.personId ?? null,
        input.result, input.findings ?? null, input.recoveryAmount ?? 0,
      ]
    );

    await client.query(
      `UPDATE grant_mgmt.settlement SET status=$2, approved_at=now() WHERE id=$1`,
      [st.id, input.result === 'FAIL' ? 'REJECTED' : 'APPROVED']
    );

    if (input.result !== 'FAIL') {
      await client.query(
        `UPDATE grant_mgmt.award SET status='CLOSED', closed_at=now() WHERE id=$1`, [awardId]
      );
      // 검사를 통과한 건은 공시 대상이 된다
      await client.query(
        `INSERT INTO grant_mgmt.disclosure (award_id, fiscal_year, summary)
         SELECT w.id, p.fiscal_year,
                jsonb_build_object(
                  'awarded', w.awarded_amount,
                  'executed', s.executed_amount,
                  'returned', s.returned_amount,
                  'result', $2::text)
           FROM grant_mgmt.award w
           JOIN grant_mgmt.program p ON p.id = w.program_id
           JOIN grant_mgmt.settlement s ON s.award_id = w.id
          WHERE w.id = $1
         ON CONFLICT (award_id) DO NOTHING`,
        [awardId, input.result]
      );
    }

    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'grant_mgmt', entityTable: 'inspection', entityId: st.id,
        action: 'INSPECT',
        after: { result: input.result, recovery: input.recoveryAmount ?? 0 },
        note: input.findings ?? null,
      },
      client
    );
  });
}

/** 공시 목록 (대외 공개) */
export async function listDisclosures(fiscalYear?: number) {
  return query<{
    award_id: UUID;
    fiscal_year: number;
    org_name: I18nText;
    program_name: I18nText;
    summary: Record<string, unknown>;
    published_at: string;
  }>(
    `SELECT d.award_id, d.fiscal_year, o.name_i18n AS org_name,
            p.name_i18n AS program_name, d.summary, d.published_at
       FROM grant_mgmt.disclosure d
       JOIN grant_mgmt.award w ON w.id = d.award_id
       JOIN core.organization o ON o.id = w.grantee_org_id
       JOIN grant_mgmt.program p ON p.id = w.program_id
      WHERE d.is_public
        AND ($1::int IS NULL OR d.fiscal_year = $1)
      ORDER BY d.published_at DESC`,
    [fiscalYear ?? null]
  );
}

// ── 관점 판단 ───────────────────────────────────────────────────────

export type GrantPerspective = 'GRANTOR' | 'GRANTEE' | 'BOTH' | 'NONE';

/**
 * 이 조직이 보조금을 "주는 쪽"인지 "받는 쪽"인지 판단한다.
 *
 * 같은 데이터를 두 입장에서 보게 되는데 관심사가 완전히 다르다.
 *   주는 쪽: 누구에게 얼마를 줬고 제대로 썼는가
 *   받는 쪽: 얼마 남았고 언제까지 정산하는가
 * 한 화면에 섞으면 둘 다 못 쓰게 되므로 역할로 갈라 보여준다.
 *
 * 체육회처럼 위에서 받아 아래로 내려보내는 조직은 BOTH 가 된다.
 */
export async function getGrantPerspective(orgId: UUID): Promise<GrantPerspective> {
  const row = await queryOne<{ grantor: number; grantee: number }>(
    `SELECT
       ((SELECT count(*) FROM grant_mgmt.program WHERE owner_org_id = $1)
        + (SELECT count(*) FROM grant_mgmt.award w
            JOIN grant_mgmt.award p ON p.id = w.parent_award_id
           WHERE p.grantee_org_id = $1))::int AS grantor,
       (SELECT count(*) FROM grant_mgmt.award WHERE grantee_org_id = $1)::int AS grantee`,
    [orgId]
  );
  const isGrantor = (row?.grantor ?? 0) > 0;
  const isGrantee = (row?.grantee ?? 0) > 0;
  if (isGrantor && isGrantee) return 'BOTH';
  if (isGrantor) return 'GRANTOR';
  if (isGrantee) return 'GRANTEE';
  return 'NONE';
}

/** 주는 쪽 요약 */
export async function getGrantorSummary(orgId: UUID) {
  return queryOne<{
    programs: number;
    awards: number;
    awarded_total: string;
    executed_total: string;
    execution_rate: number;
    unsettled: number;
    overdue: number;
  }>(
    `WITH mine AS (
       SELECT w.* FROM grant_mgmt.award w
        WHERE w.program_id IN (SELECT id FROM grant_mgmt.program WHERE owner_org_id = $1)
           OR w.parent_award_id IN (SELECT id FROM grant_mgmt.award WHERE grantee_org_id = $1)
     )
     SELECT
       (SELECT count(*)::int FROM grant_mgmt.program WHERE owner_org_id = $1) AS programs,
       (SELECT count(*)::int FROM mine) AS awards,
       COALESCE((SELECT sum(awarded_amount) FROM mine), 0)::text AS awarded_total,
       COALESCE((SELECT sum(e.amount) FROM grant_mgmt.execution e
                  WHERE e.award_id IN (SELECT id FROM mine)), 0)::text AS executed_total,
       CASE WHEN COALESCE((SELECT sum(awarded_amount) FROM mine), 0) > 0
            THEN round(COALESCE((SELECT sum(e.amount) FROM grant_mgmt.execution e
                                  WHERE e.award_id IN (SELECT id FROM mine)), 0)
                       / (SELECT sum(awarded_amount) FROM mine) * 100)::int
            ELSE 0 END AS execution_rate,
       (SELECT count(*)::int FROM mine WHERE status <> 'CLOSED') AS unsettled,
       (SELECT count(*)::int FROM mine
         WHERE status <> 'CLOSED' AND settlement_due_on IS NOT NULL
           AND settlement_due_on < CURRENT_DATE) AS overdue`,
    [orgId]
  );
}

/** 받는 쪽 요약 */
export async function getGranteeSummary(orgId: UUID) {
  return queryOne<{
    awards: number;
    awarded_total: string;
    executed_total: string;
    remaining: string;
    due_soon: number;
    overdue: number;
  }>(
    `SELECT
       count(*)::int AS awards,
       COALESCE(sum(w.awarded_amount), 0)::text AS awarded_total,
       COALESCE(sum(ex.total), 0)::text AS executed_total,
       COALESCE(sum(w.awarded_amount) - sum(COALESCE(ex.total, 0)), 0)::text AS remaining,
       count(*) FILTER (
         WHERE w.status <> 'CLOSED' AND w.settlement_due_on IS NOT NULL
           AND w.settlement_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
       )::int AS due_soon,
       count(*) FILTER (
         WHERE w.status <> 'CLOSED' AND w.settlement_due_on IS NOT NULL
           AND w.settlement_due_on < CURRENT_DATE
       )::int AS overdue
     FROM grant_mgmt.award w
     LEFT JOIN LATERAL (
       SELECT sum(amount) AS total FROM grant_mgmt.execution e WHERE e.award_id = w.id
     ) ex ON true
     WHERE w.grantee_org_id = $1`,
    [orgId]
  );
}

/**
 * 교부건 하나의 상세 — 화면이 필요로 하는 것을 한 번에 모은다.
 * 남은 금액을 함께 돌려주는 이유: 초과 집행은 막고 있지만,
 * 에러로 알려주면 이미 늦다. 입력하기 전에 보여줘야 한다.
 */
export async function getAwardDetail(awardId: UUID) {
  const award = await queryOne<
    Award & {
      org_name: I18nText;
      program_name: I18nText;
      executed_amount: string;
      self_executed: string;
      remaining: string;
      self_remaining: string;
      execution_rate: number;
      overdue: boolean;
    }
  >(
    `SELECT w.*, o.name_i18n AS org_name, p.name_i18n AS program_name,
            COALESCE(g.total, 0)::text AS executed_amount,
            COALESCE(s.total, 0)::text AS self_executed,
            (w.awarded_amount - COALESCE(g.total, 0))::text AS remaining,
            (w.self_funding - COALESCE(s.total, 0))::text AS self_remaining,
            CASE WHEN w.awarded_amount > 0
                 THEN round(COALESCE(g.total, 0) / w.awarded_amount * 100)::int
                 ELSE 0 END AS execution_rate,
            (w.settlement_due_on IS NOT NULL AND w.settlement_due_on < CURRENT_DATE
             AND w.status <> 'CLOSED') AS overdue
       FROM grant_mgmt.award w
       JOIN core.organization o ON o.id = w.grantee_org_id
       JOIN grant_mgmt.program p ON p.id = w.program_id
       LEFT JOIN LATERAL (SELECT sum(amount) AS total FROM grant_mgmt.execution e
                           WHERE e.award_id = w.id AND e.fund_source <> 'SELF') g ON true
       LEFT JOIN LATERAL (SELECT sum(amount) AS total FROM grant_mgmt.execution e
                           WHERE e.award_id = w.id AND e.fund_source = 'SELF') s ON true
      WHERE w.id = $1`,
    [awardId]
  );
  if (!award) return null;

  const [executions, byFund, children, settlement, inspections] = await Promise.all([
    query<{
      id: UUID; executed_on: string; amount: string; fund_source: FundSource;
      payee: string | null; description: string | null; evidence_no: string | null;
    }>(
      `SELECT id, executed_on, amount, fund_source, payee, description, evidence_no
         FROM grant_mgmt.execution WHERE award_id = $1 ORDER BY executed_on DESC`,
      [awardId]
    ),
    getExecutionByFundSource(awardId),
    query<{ id: UUID; org_name: I18nText; awarded_amount: string; status: string; executed: string }>(
      `SELECT w.id, o.name_i18n AS org_name, w.awarded_amount, w.status,
              COALESCE((SELECT sum(e.amount) FROM grant_mgmt.execution e WHERE e.award_id = w.id), 0)::text AS executed
         FROM grant_mgmt.award w
         JOIN core.organization o ON o.id = w.grantee_org_id
        WHERE w.parent_award_id = $1
        ORDER BY w.decided_at`,
      [awardId]
    ),
    queryOne<{
      id: UUID; executed_amount: string; remaining_amount: string;
      returned_amount: string; carried_over_amount: string; status: string; submitted_at: string | null;
    }>(`SELECT * FROM grant_mgmt.settlement WHERE award_id = $1`, [awardId]),
    query<{ result: string; findings: string | null; recovery_amount: string; inspected_at: string }>(
      `SELECT i.result, i.findings, i.recovery_amount, i.inspected_at
         FROM grant_mgmt.inspection i
         JOIN grant_mgmt.settlement s ON s.id = i.settlement_id
        WHERE s.award_id = $1 ORDER BY i.inspected_at DESC`,
      [awardId]
    ),
  ]);

  return { award, executions, byFund, children, settlement, inspections };
}
