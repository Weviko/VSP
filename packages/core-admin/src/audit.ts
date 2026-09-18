/**
 * 감사 추적.
 * 원칙: 결재·승인·금액·개인정보에 관련된 모든 변경은 반드시 기록한다.
 * 이 기록은 나중에 정부 감사와 법적 분쟁에서 증거가 된다. 삭제·수정 경로를 만들지 않는다.
 */
import { query as dbQuery, type DbClient } from './db';
import type { AuditInput, UUID } from './types';

export async function writeAudit(input: AuditInput, client?: DbClient): Promise<void> {
  const run = client
    ? (sql: string, p: unknown[]) => client.query(sql, p)
    : (sql: string, p: unknown[]) => dbQuery(sql, p);
  await run(
    `INSERT INTO core.audit_log
       (actor_person_id, actor_org_id, actor_ip, entity_schema, entity_table,
        entity_id, action, before_data, after_data, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.actorPersonId ?? null,
      input.actorOrgId ?? null,
      input.actorIp ?? null,
      input.entitySchema,
      input.entityTable,
      input.entityId ?? null,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.note ?? null,
    ]
  );
}

// ── 감사 로그 조회 (감사관·관리자 화면용) ─────────────────────────────────────
// 읽기 전용. 감사 기록은 절대 수정·삭제하지 않는다(위 원칙). 여기서는 필터 조회만 제공한다.

export interface AuditRow {
  id: string;
  occurred_at: string;
  actor_person_id: UUID | null;
  actor_name: string | null;
  actor_org_id: UUID | null;
  actor_ip: string | null;
  entity_schema: string;
  entity_table: string;
  entity_id: UUID | null;
  action: string;
  before_data: unknown;
  after_data: unknown;
  note: string | null;
}

export interface AuditFilter {
  entityTable?: string | null;
  action?: string | null;
  actorPersonId?: UUID | null;
  entityId?: UUID | null;
  from?: string | null;   // YYYY-MM-DD (포함)
  to?: string | null;     // YYYY-MM-DD (해당 일자 끝까지 포함)
  limit?: number;
}

/** 감사 기록 조회 — 엔티티·액션·담당자·기간으로 좁힌다. 변경 전/후(before/after) 포함. */
export async function listAuditLog(filter: AuditFilter = {}): Promise<AuditRow[]> {
  return dbQuery<AuditRow>(
    `SELECT a.id::text, a.occurred_at::text, a.actor_person_id, p.full_name AS actor_name,
            a.actor_org_id, a.actor_ip::text, a.entity_schema, a.entity_table, a.entity_id,
            a.action, a.before_data, a.after_data, a.note
       FROM core.audit_log a
       LEFT JOIN core.person p ON p.id = a.actor_person_id
      WHERE ($1::text IS NULL OR a.entity_table = $1)
        AND ($2::text IS NULL OR a.action = $2)
        AND ($3::uuid IS NULL OR a.actor_person_id = $3)
        AND ($4::uuid IS NULL OR a.entity_id = $4)
        AND ($5::date IS NULL OR a.occurred_at >= $5::date)
        AND ($6::date IS NULL OR a.occurred_at < ($6::date + 1))
      ORDER BY a.occurred_at DESC
      LIMIT $7`,
    [
      filter.entityTable ?? null, filter.action ?? null, filter.actorPersonId ?? null,
      filter.entityId ?? null, filter.from ?? null, filter.to ?? null,
      Math.min(Math.max(filter.limit ?? 100, 1), 500),
    ]
  );
}

export interface AuditFacets { tables: string[]; actions: string[]; }

/** 필터 선택지 — 실제로 기록에 등장한 엔티티 표·액션만 보여준다. */
export async function auditFacets(): Promise<AuditFacets> {
  const [t, a] = await Promise.all([
    dbQuery<{ v: string }>(`SELECT DISTINCT entity_table AS v FROM core.audit_log ORDER BY v`),
    dbQuery<{ v: string }>(`SELECT DISTINCT action AS v FROM core.audit_log ORDER BY v`),
  ]);
  return { tables: t.map((r) => r.v), actions: a.map((r) => r.v) };
}
