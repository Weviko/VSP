/**
 * 기관 간 공문 유통.
 *
 * 지금까지의 결재는 조직 "내부"에서만 돌았다. 부처가 쓰려면
 * 문체부 → 체육회 → 협회로 공문이 내려가고 보고가 올라가는 경로가 필요하다.
 * 한국 온나라시스템의 흐름을 따른다:
 *
 *   기안 → (관련 기관) 합의 → 결재 → 시행 → 상대 기관 접수 → 열람범위 지정
 *
 * 합의와 승인은 다르다. 합의는 관련 기관의 의견을 묻는 절차이며,
 * 반대 의견이 나와도 기안 기관이 최종 판단할 수 있다. 그 판단 근거가 기록으로 남는다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type DispatchStatus = 'SENT' | 'RECEIVED' | 'READ' | 'RETURNED';
export type ConcurrenceStatus = 'REQUESTED' | 'AGREED' | 'DISAGREED' | 'SKIPPED';

export interface DispatchRow {
  id: UUID;
  document_id: UUID;
  from_org_id: UUID;
  to_org_id: UUID;
  recipient_type: 'TO' | 'CC';
  status: DispatchStatus;
  receipt_no: string | null;
  reply_due_on: string | null;
  reply_doc_id: UUID | null;
  sent_at: string;
  received_at: string | null;
  read_at: string | null;
  /* 조인 */
  doc_no: string;
  title: string;
  urgency: string;
  from_org_name: I18nText;
  to_org_name: I18nText;
  overdue: boolean;
}

/** 문서 대장 번호를 발번한다. 기관·연도·구분별로 1부터 순번을 매긴다. */
async function nextRegisterNo(
  client: { query<T = Record<string, unknown>>(t: string, p?: unknown[]): Promise<{ rows: T[] }> },
  orgId: UUID,
  registerType: 'PRODUCED' | 'RECEIVED',
  orgCode: string | null
): Promise<{ year: number; seq: number; registerNo: string }> {
  const year = new Date().getFullYear();
  const res = await client.query<{ seq: number }>(
    `SELECT COALESCE(max(seq), 0) + 1 AS seq
       FROM core.document_register
      WHERE org_id = $1 AND register_type = $2 AND year = $3`,
    [orgId, registerType, year]
  );
  const seq = res.rows[0]?.seq ?? 1;
  const prefix = orgCode ?? (registerType === 'PRODUCED' ? 'OUT' : 'IN');
  return { year, seq, registerNo: `${prefix}-${year}-${String(seq).padStart(4, '0')}` };
}

export interface DocumentRecord {
  id: UUID;
  doc_no: string;
  title: string;
  body: string | null;
  doc_type: string | null;
  confidentiality: string;
  from_org_id: UUID | null;
  to_org_id: UUID | null;
  doc_kind: string | null;
  issued_at: string | null;
  registered_at: string | null;
  created_at: string;
}

/** 공문 한 건. 상세 화면용. */
export async function getDocument(id: UUID): Promise<DocumentRecord | null> {
  return queryOne<DocumentRecord>(
    `SELECT id, doc_no, title, body, doc_type, confidentiality,
            from_org_id, to_org_id, doc_kind, issued_at::text, registered_at::text, created_at::text
       FROM core.document WHERE id = $1`,
    [id]
  );
}

export interface CreateDocumentInput {
  title: string;
  body?: string | null;
  docType?: string | null;          // OFFICIAL_LETTER / DECISION / REPORT / PLAN
  confidentiality?: string;         // PUBLIC / INTERNAL / CONFIDENTIAL
  fromOrgId?: UUID | null;
  docNo?: string | null;            // 없으면 자동 발번
}

/**
 * 공문 기안(문서 레코드 생성). 시행(발송)은 sendDocument 가 별도로 한다.
 * doc_no 는 유일해야 하므로, 주지 않으면 기관 코드+연도+시퀀스로 자동 발번한다.
 */
export async function createDocument(
  input: CreateDocumentInput,
  actor: { personId?: UUID | null } = {}
): Promise<DocumentRecord> {
  return tx(async (client) => {
    // 문서 자체 번호(doc_no)는 유일하기만 하면 된다. 시행 대장번호(register_no)는 sendDocument 가 따로 발번한다.
    let docNo = input.docNo?.trim() || null;
    if (!docNo) {
      const org = input.fromOrgId
        ? (await client.query<{ display_id: string | null }>(`SELECT display_id FROM core.organization WHERE id=$1`, [input.fromOrgId])).rows[0]
        : null;
      const prefix = org?.display_id ?? 'DOC';
      docNo = `${prefix}-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    }
    const res = await client.query<DocumentRecord>(
      `INSERT INTO core.document (doc_no, title, body, doc_type, confidentiality, from_org_id, doc_kind)
       VALUES ($1,$2,$3,$4,COALESCE($5,'INTERNAL'),$6,'DRAFT')
       RETURNING id, doc_no, title, body, doc_type, confidentiality,
                 from_org_id, to_org_id, doc_kind, issued_at::text, registered_at::text, created_at::text`,
      [docNo, input.title.trim(), input.body?.trim() || null, input.docType ?? null, input.confidentiality ?? null, input.fromOrgId ?? null]
    );
    const doc = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: input.fromOrgId,
        entitySchema: 'core', entityTable: 'document', entityId: doc.id,
        action: 'INSERT', after: { doc_no: doc.doc_no, title: doc.title },
      },
      client
    );
    return doc;
  });
}

export interface SendDocumentInput {
  documentId: UUID;
  fromOrgId: UUID;
  toOrgIds: UUID[];
  ccOrgIds?: UUID[];
  replyDueOn?: string | null;
}

/**
 * 공문 시행 (발송).
 * 발송과 동시에 발신 기관의 생산 대장에 등재한다.
 * 감사에서 가장 먼저 확인하는 것이 대장이기 때문이다.
 */
export async function sendDocument(
  input: SendDocumentInput,
  actor: { personId?: UUID | null } = {}
): Promise<{ dispatched: number; registerNo: string }> {
  return tx(async (client) => {
    const org = (
      await client.query<{ display_id: string | null }>(
        `SELECT display_id FROM core.organization WHERE id = $1`,
        [input.fromOrgId]
      )
    ).rows[0];

    const reg = await nextRegisterNo(client, input.fromOrgId, 'PRODUCED', org?.display_id ?? null);
    await client.query(
      `INSERT INTO core.document_register
         (org_id, document_id, register_type, year, seq, register_no)
       VALUES ($1,$2,'PRODUCED',$3,$4,$5)`,
      [input.fromOrgId, input.documentId, reg.year, reg.seq, reg.registerNo]
    );

    await client.query(
      `UPDATE core.document
          SET doc_kind = 'OUTGOING', issued_at = COALESCE(issued_at, now()),
              registered_at = now()
        WHERE id = $1`,
      [input.documentId]
    );

    const targets: Array<{ id: UUID; type: 'TO' | 'CC' }> = [
      ...input.toOrgIds.map((id) => ({ id, type: 'TO' as const })),
      ...(input.ccOrgIds ?? []).map((id) => ({ id, type: 'CC' as const })),
    ];

    for (const t of targets) {
      await client.query(
        `INSERT INTO core.dispatch
           (document_id, from_org_id, to_org_id, recipient_type, status, reply_due_on)
         VALUES ($1,$2,$3,$4,'SENT',$5)
         ON CONFLICT (document_id, to_org_id) DO NOTHING`,
        [input.documentId, input.fromOrgId, t.id, t.type, input.replyDueOn ?? null]
      );
    }

    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: input.fromOrgId,
        entitySchema: 'core',
        entityTable: 'document',
        entityId: input.documentId,
        action: 'DISPATCH',
        after: { to: input.toOrgIds, cc: input.ccOrgIds ?? [], register_no: reg.registerNo },
      },
      client
    );

    return { dispatched: targets.length, registerNo: reg.registerNo };
  });
}

/**
 * 공문 접수.
 * 접수 기관의 접수 대장에 등재하고 접수번호를 부여한다.
 */
export async function receiveDocument(
  dispatchId: UUID,
  actor: { personId: UUID; orgId: UUID }
): Promise<{ receiptNo: string }> {
  return tx(async (client) => {
    const d = (
      await client.query<{ document_id: UUID; to_org_id: UUID; status: string }>(
        `SELECT document_id, to_org_id, status FROM core.dispatch WHERE id = $1`,
        [dispatchId]
      )
    ).rows[0];
    if (!d) throw new Error('dispatch not found');
    if (d.status !== 'SENT') throw new Error(`already ${d.status}`);

    const org = (
      await client.query<{ display_id: string | null }>(
        `SELECT display_id FROM core.organization WHERE id = $1`,
        [d.to_org_id]
      )
    ).rows[0];

    const reg = await nextRegisterNo(client, d.to_org_id, 'RECEIVED', org?.display_id ?? null);
    await client.query(
      `INSERT INTO core.document_register
         (org_id, document_id, register_type, year, seq, register_no)
       VALUES ($1,$2,'RECEIVED',$3,$4,$5)`,
      [d.to_org_id, d.document_id, reg.year, reg.seq, reg.registerNo]
    );

    await client.query(
      `UPDATE core.dispatch
          SET status='RECEIVED', received_by=$2, receipt_no=$3, received_at=now()
        WHERE id=$1`,
      [dispatchId, actor.personId, reg.registerNo]
    );

    // 접수자는 기본 열람권을 갖는다. 추가 열람범위는 별도로 지정한다.
    await client.query(
      `INSERT INTO core.document_access (document_id, person_id, granted_by)
       VALUES ($1,$2,$2)`,
      [d.document_id, actor.personId]
    );

    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'core',
        entityTable: 'dispatch',
        entityId: dispatchId,
        action: 'RECEIVE',
        after: { receipt_no: reg.registerNo },
      },
      client
    );

    return { receiptNo: reg.registerNo };
  });
}

/** 열람 범위 지정 — 접수한 공문을 누구까지 볼 수 있는지 */
export async function grantDocumentAccess(
  documentId: UUID,
  target: { orgId?: UUID | null; personId?: UUID | null; roleCode?: string | null },
  actor: { personId: UUID }
): Promise<void> {
  await query(
    `INSERT INTO core.document_access (document_id, org_id, person_id, role_code, granted_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [documentId, target.orgId ?? null, target.personId ?? null, target.roleCode ?? null, actor.personId]
  );
}

/** 받은 공문함 */
export async function listInbox(
  orgId: UUID,
  opts: { status?: DispatchStatus | null; limit?: number } = {}
): Promise<DispatchRow[]> {
  return query<DispatchRow>(
    `SELECT d.*, doc.doc_no, doc.title, doc.urgency,
            fo.name_i18n AS from_org_name, too.name_i18n AS to_org_name,
            (d.reply_due_on IS NOT NULL AND d.reply_doc_id IS NULL
             AND d.reply_due_on < CURRENT_DATE) AS overdue
       FROM core.dispatch d
       JOIN core.document doc ON doc.id = d.document_id
       JOIN core.organization fo ON fo.id = d.from_org_id
       JOIN core.organization too ON too.id = d.to_org_id
      WHERE d.to_org_id = $1
        AND ($2::text IS NULL OR d.status = $2)
      ORDER BY overdue DESC, d.sent_at DESC
      LIMIT $3`,
    [orgId, opts.status ?? null, opts.limit ?? 100]
  );
}

/** 보낸 공문함 */
export async function listOutbox(orgId: UUID, limit = 100): Promise<DispatchRow[]> {
  return query<DispatchRow>(
    `SELECT d.*, doc.doc_no, doc.title, doc.urgency,
            fo.name_i18n AS from_org_name, too.name_i18n AS to_org_name,
            false AS overdue
       FROM core.dispatch d
       JOIN core.document doc ON doc.id = d.document_id
       JOIN core.organization fo ON fo.id = d.from_org_id
       JOIN core.organization too ON too.id = d.to_org_id
      WHERE d.from_org_id = $1
      ORDER BY d.sent_at DESC
      LIMIT $2`,
    [orgId, limit]
  );
}

// ── 합의(협조) ──────────────────────────────────────────────────────

export interface ConcurrenceRow {
  id: UUID;
  document_id: UUID;
  org_id: UUID;
  status: ConcurrenceStatus;
  opinion: string | null;
  requested_at: string;
  responded_at: string | null;
  doc_no: string;
  title: string;
  org_name: I18nText;
}

export async function requestConcurrence(
  documentId: UUID,
  orgIds: UUID[],
  actor: { personId?: UUID | null } = {}
): Promise<number> {
  return tx(async (client) => {
    let n = 0;
    for (const orgId of orgIds) {
      const r = await client.query(
        `INSERT INTO core.document_concurrence (document_id, org_id, status)
         VALUES ($1,$2,'REQUESTED')
         ON CONFLICT (document_id, org_id) DO NOTHING`,
        [documentId, orgId]
      );
      n += r.rows.length ? 1 : 1;
    }
    await writeAudit(
      {
        actorPersonId: actor.personId,
        entitySchema: 'core',
        entityTable: 'document',
        entityId: documentId,
        action: 'REQUEST_CONCURRENCE',
        after: { orgs: orgIds },
      },
      client
    );
    return n;
  });
}

export async function respondConcurrence(
  concurrenceId: UUID,
  status: 'AGREED' | 'DISAGREED',
  actor: { personId: UUID; orgId?: UUID | null },
  opinion?: string
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE core.document_concurrence
          SET status=$2, opinion=$3, responded_by=$4, responded_at=now()
        WHERE id=$1`,
      [concurrenceId, status, opinion ?? null, actor.personId]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'core',
        entityTable: 'document_concurrence',
        entityId: concurrenceId,
        action: status,
        note: opinion ?? null,
      },
      client
    );
  });
}

/** 우리 기관에 들어온 합의 요청 */
export async function listConcurrenceRequests(orgId: UUID): Promise<ConcurrenceRow[]> {
  return query<ConcurrenceRow>(
    `SELECT c.*, doc.doc_no, doc.title, o.name_i18n AS org_name
       FROM core.document_concurrence c
       JOIN core.document doc ON doc.id = c.document_id
       JOIN core.organization o ON o.id = c.org_id
      WHERE c.org_id = $1 AND c.status = 'REQUESTED'
      ORDER BY c.requested_at`,
    [orgId]
  );
}

/** 문서 대장 */
export async function listRegister(
  orgId: UUID,
  registerType: 'PRODUCED' | 'RECEIVED',
  year?: number
): Promise<Array<{ register_no: string; doc_no: string; title: string; registered_at: string }>> {
  return query(
    `SELECT r.register_no, d.doc_no, d.title, r.registered_at
       FROM core.document_register r
       JOIN core.document d ON d.id = r.document_id
      WHERE r.org_id = $1 AND r.register_type = $2
        AND ($3::int IS NULL OR r.year = $3)
      ORDER BY r.year DESC, r.seq DESC`,
    [orgId, registerType, year ?? null]
  );
}
