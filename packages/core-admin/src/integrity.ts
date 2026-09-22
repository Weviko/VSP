/**
 * 스포츠 공정·윤리 신고 (integrity).
 *
 * 접수 → 선별 → 조사 → 결정 → 조치(징계) → 종결의 사건 워크플로.
 * 한국 스포츠윤리센터를 벤치마크. 제보자·피해자·미성년 신원은 integrity 스키마 안에만 두고
 * pub 으로 내보내지 않는다(공개 계층은 020). 익명 접수는 접수번호(해시만 저장)로 진행조회한다.
 * 조치(정지·박탈)는 sport.registration.status='SUSPENDED' 로 반영돼 checkEligibility 게이트에 자동으로 걸린다.
 * 모든 상태변경은 writeAudit 로 감사증거를 남긴다.
 */
import { createHash, randomInt } from 'node:crypto';
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type IntegrityCategory = 'VIOLENCE' | 'SEXUAL' | 'MATCH_FIXING' | 'CORRUPTION' | 'OTHER';
export type ReportStatus = 'RECEIVED' | 'SCREENING' | 'INVESTIGATING' | 'DECIDED' | 'CLOSED' | 'DISMISSED';
export type Severity = 'LOW' | 'MED' | 'HIGH';
export type MeasureType = 'WARNING' | 'SUSPENSION' | 'BAN' | 'EDU_ORDER' | 'REFERRAL';
export type ReportActionType = 'SCREEN' | 'ASSIGN' | 'REQUEST_INFO' | 'INTERVIEW' | 'DECIDE' | 'NOTE' | 'CLOSE';

type Actor = { personId?: UUID | null; orgId?: UUID | null };

// 접수번호에 헷갈리는 글자(0/O/1/I)를 뺀 문자셋.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeTrackingCode(): string {
  let s = '';
  for (let i = 0; i < 9; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

// ── 접수 ────────────────────────────────────────────────────────────────

export interface FileReportInput {
  category: IntegrityCategory;
  title: string;
  detail?: string | null;
  isAnonymous: boolean;
  reporterPersonId?: UUID | null;
  reporterContact?: string | null;
  sportId?: UUID | null;
  respondentOrgId?: UUID | null;
  respondentName?: string | null;
  isMinorInvolved?: boolean;
}

export interface FileReportResult {
  id: UUID;
  caseNo: string;
  /** 접수번호(평문). 진행조회용. 이 한 번만 반환하고 서버에는 해시만 남는다. */
  trackingCode: string;
}

export async function fileReport(input: FileReportInput, actor: Actor = {}): Promise<FileReportResult> {
  const trackingCode = makeTrackingCode();
  const tracking_code_hash = hashCode(trackingCode);
  return tx(async (client) => {
    const caseNo = (await client.query<{ case_no: string }>(
      `SELECT 'RPT-' || to_char(now(),'YYYY') || '-' || lpad((count(*) + 1)::text, 6, '0') AS case_no
         FROM integrity.report
        WHERE case_no LIKE 'RPT-' || to_char(now(),'YYYY') || '-%'`
    )).rows[0].case_no;

    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO integrity.report
         (case_no, category, title, detail, is_anonymous, reporter_person_id, reporter_contact,
          tracking_code_hash, sport_id, respondent_org_id, respondent_name, is_minor_involved, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'RECEIVED')
       RETURNING id`,
      [
        caseNo, input.category, input.title, input.detail ?? null, input.isAnonymous,
        input.isAnonymous ? null : input.reporterPersonId ?? null, input.reporterContact ?? null,
        tracking_code_hash, input.sportId ?? null, input.respondentOrgId ?? null,
        input.respondentName ?? null, input.isMinorInvolved ?? false,
      ]
    )).rows[0];

    // 실명 제보자는 관계인으로도 남긴다(익명은 남기지 않는다).
    if (!input.isAnonymous && input.reporterPersonId) {
      await client.query(
        `INSERT INTO integrity.report_party (report_id, party_role, person_id, contact)
         VALUES ($1,'REPORTER',$2,$3)`,
        [row.id, input.reporterPersonId, input.reporterContact ?? null]
      );
    }
    // 피신고 조직이 있으면 관계인으로 남긴다.
    if (input.respondentOrgId || input.respondentName) {
      await client.query(
        `INSERT INTO integrity.report_party (report_id, party_role, org_id, name_text)
         VALUES ($1,'RESPONDENT',$2,$3)`,
        [row.id, input.respondentOrgId ?? null, input.respondentName ?? null]
      );
    }

    await writeAudit(
      {
        actorPersonId: actor.personId ?? (input.isAnonymous ? null : input.reporterPersonId ?? null),
        actorOrgId: actor.orgId ?? null,
        entitySchema: 'integrity', entityTable: 'report', entityId: row.id,
        action: 'FILE_REPORT',
        after: { case_no: caseNo, category: input.category, anonymous: input.isAnonymous },
      },
      client
    );
    return { id: row.id, caseNo, trackingCode };
  });
}

// ── 조회 (업무) ───────────────────────────────────────────────────────────

export interface ReportListRow {
  id: UUID;
  case_no: string;
  category: IntegrityCategory;
  title: string;
  status: ReportStatus;
  severity: Severity | null;
  sport_name: I18nText | null;
  assigned_name: string | null;
  is_minor_involved: boolean;
  received_at: string;
}

export async function listReports(
  filter: { status?: ReportStatus | null; category?: IntegrityCategory | null } = {}
): Promise<ReportListRow[]> {
  return query<ReportListRow>(
    `SELECT r.id, r.case_no, r.category, r.title, r.status, r.severity,
            s.name_i18n AS sport_name, ap.full_name AS assigned_name,
            r.is_minor_involved, r.received_at::text AS received_at
       FROM integrity.report r
       LEFT JOIN sport.sport s ON s.id = r.sport_id
       LEFT JOIN core.person ap ON ap.id = r.assigned_person_id
      WHERE ($1::text IS NULL OR r.status = $1)
        AND ($2::text IS NULL OR r.category = $2)
      ORDER BY
        CASE r.status WHEN 'RECEIVED' THEN 0 WHEN 'SCREENING' THEN 1 WHEN 'INVESTIGATING' THEN 2
                      WHEN 'DECIDED' THEN 3 WHEN 'CLOSED' THEN 4 ELSE 5 END,
        r.received_at DESC`,
    [filter.status ?? null, filter.category ?? null]
  );
}

export interface ReportRow {
  id: UUID; case_no: string; category: IntegrityCategory; title: string; detail: string | null;
  is_anonymous: boolean; reporter_contact: string | null; sport_id: UUID | null; sport_name: I18nText | null;
  respondent_org_id: UUID | null; respondent_org_name: I18nText | null; respondent_name: string | null;
  status: ReportStatus; severity: Severity | null; assigned_org_id: UUID | null; assigned_person_id: UUID | null;
  assigned_name: string | null; is_minor_involved: boolean; published: boolean; public_summary_i18n: I18nText | null;
  received_at: string; decided_at: string | null; closed_at: string | null;
}
export interface PartyRow {
  id: UUID; party_role: 'REPORTER' | 'VICTIM' | 'RESPONDENT' | 'WITNESS';
  person_name: string | null; org_name: I18nText | null; name_text: string | null; is_minor: boolean;
}
export interface ActionRow {
  id: UUID; action: ReportActionType; actor_name: string | null; note: string | null; created_at: string;
}
export interface MeasureRow {
  id: UUID; measure_type: MeasureType; target_name: string | null; decision_no: string | null;
  starts_on: string | null; ends_on: string | null; reflected_to_registration: boolean; created_at: string;
}
export interface ReportDetail { report: ReportRow; parties: PartyRow[]; actions: ActionRow[]; measures: MeasureRow[]; }

export async function getReport(id: UUID): Promise<ReportDetail | null> {
  const report = await queryOne<ReportRow>(
    `SELECT r.id, r.case_no, r.category, r.title, r.detail, r.is_anonymous, r.reporter_contact,
            r.sport_id, s.name_i18n AS sport_name,
            r.respondent_org_id, ro.name_i18n AS respondent_org_name, r.respondent_name,
            r.status, r.severity, r.assigned_org_id, r.assigned_person_id, ap.full_name AS assigned_name,
            r.is_minor_involved, r.published, r.public_summary_i18n,
            r.received_at::text AS received_at, r.decided_at::text AS decided_at, r.closed_at::text AS closed_at
       FROM integrity.report r
       LEFT JOIN sport.sport s ON s.id = r.sport_id
       LEFT JOIN core.organization ro ON ro.id = r.respondent_org_id
       LEFT JOIN core.person ap ON ap.id = r.assigned_person_id
      WHERE r.id = $1`,
    [id]
  );
  if (!report) return null;
  const [parties, actions, measures] = await Promise.all([
    query<PartyRow>(
      `SELECT pt.id, pt.party_role, p.full_name AS person_name, o.name_i18n AS org_name, pt.name_text, pt.is_minor
         FROM integrity.report_party pt
         LEFT JOIN core.person p ON p.id = pt.person_id
         LEFT JOIN core.organization o ON o.id = pt.org_id
        WHERE pt.report_id = $1 ORDER BY pt.created_at`,
      [id]
    ),
    query<ActionRow>(
      `SELECT a.id, a.action, ap.full_name AS actor_name, a.note, a.created_at::text AS created_at
         FROM integrity.report_action a
         LEFT JOIN core.person ap ON ap.id = a.actor_person_id
        WHERE a.report_id = $1 ORDER BY a.created_at`,
      [id]
    ),
    query<MeasureRow>(
      `SELECT m.id, m.measure_type, COALESCE(tp.full_name, to2.name_i18n->>'vi') AS target_name,
              m.decision_no, m.starts_on::text AS starts_on, m.ends_on::text AS ends_on,
              m.reflected_to_registration, m.created_at::text AS created_at
         FROM integrity.measure m
         LEFT JOIN core.person tp ON tp.id = m.target_person_id
         LEFT JOIN core.organization to2 ON to2.id = m.target_org_id
        WHERE m.report_id = $1 ORDER BY m.created_at`,
      [id]
    ),
  ]);
  return { report, parties, actions, measures };
}

// ── 처리 (사건 워크플로) ──────────────────────────────────────────────────

async function logAction(
  client: { query: (t: string, p?: unknown[]) => Promise<unknown> },
  reportId: UUID, action: ReportActionType, note: string | null, actor: Actor
) {
  await client.query(
    `INSERT INTO integrity.report_action (report_id, action, actor_person_id, actor_org_id, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [reportId, action, actor.personId ?? null, actor.orgId ?? null, note]
  );
}

/** 선별 — 접수건을 조사 대상으로 채택하거나(SCREENING) 각하한다(DISMISSED). */
export async function screenReport(
  reportId: UUID,
  input: { severity?: Severity | null; dismiss?: boolean; reason?: string | null },
  actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    const next = input.dismiss ? 'DISMISSED' : 'SCREENING';
    await client.query(
      `UPDATE integrity.report SET severity = COALESCE($2, severity), status = $3 WHERE id = $1`,
      [reportId, input.severity ?? null, next]
    );
    await logAction(client, reportId, 'SCREEN', input.reason ?? null, actor);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'integrity', entityTable: 'report', entityId: reportId,
        action: input.dismiss ? 'DISMISS' : 'SCREEN', after: { status: next, severity: input.severity ?? null }, note: input.reason ?? null },
      client
    );
  });
}

/** 조사자 배정 — 담당 조직·담당자를 지정하고 조사에 착수(INVESTIGATING). */
export async function assignReport(
  reportId: UUID, input: { orgId?: UUID | null; personId?: UUID | null }, actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE integrity.report
          SET assigned_org_id = $2, assigned_person_id = $3,
              status = CASE WHEN status IN ('RECEIVED','SCREENING') THEN 'INVESTIGATING' ELSE status END
        WHERE id = $1`,
      [reportId, input.orgId ?? null, input.personId ?? null]
    );
    await logAction(client, reportId, 'ASSIGN', null, actor);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'integrity', entityTable: 'report', entityId: reportId,
        action: 'ASSIGN', after: { assigned_org: input.orgId ?? null, assigned_person: input.personId ?? null } },
      client
    );
  });
}

/** 사건일지 추가(자료요청·면담·메모). 상태는 바꾸지 않는다. */
export async function addReportAction(
  reportId: UUID, input: { action: ReportActionType; note?: string | null }, actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    await logAction(client, reportId, input.action, input.note ?? null, actor);
  });
}

/** 조사 결과 결정(DECIDED). */
export async function decideReport(
  reportId: UUID, input: { summary?: string | null }, actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE integrity.report SET status = 'DECIDED', decided_at = now() WHERE id = $1`,
      [reportId]
    );
    await logAction(client, reportId, 'DECIDE', input.summary ?? null, actor);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'integrity', entityTable: 'report', entityId: reportId,
        action: 'DECIDE', after: { status: 'DECIDED' }, note: input.summary ?? null },
      client
    );
  });
}

/**
 * 조치·징계 기록. SUSPENSION/BAN 이고 대상 개인+종목이 있으면
 * 그 사람의 해당 종목 승인 등록을 SUSPENDED 로 바꿔 출전 자격을 자동 차단한다.
 */
export interface MeasureInput {
  measureType: MeasureType;
  targetPersonId?: UUID | null;
  targetOrgId?: UUID | null;
  decisionNo?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}
export async function recordMeasure(reportId: UUID, input: MeasureInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const report = (await client.query<{ sport_id: UUID | null }>(
      `SELECT sport_id FROM integrity.report WHERE id = $1`, [reportId]
    )).rows[0];

    let reflected = false;
    const blocks = input.measureType === 'SUSPENSION' || input.measureType === 'BAN';
    if (blocks && input.targetPersonId && report?.sport_id) {
      const res = await client.query(
        `UPDATE sport.registration
            SET status = 'SUSPENDED', updated_at = now()
          WHERE person_id = $1 AND sport_id = $2 AND status = 'APPROVED'`,
        [input.targetPersonId, report.sport_id]
      );
      reflected = (res as { rowCount?: number }).rowCount ? (res as { rowCount: number }).rowCount > 0 : false;
    }

    const m = (await client.query<{ id: UUID }>(
      `INSERT INTO integrity.measure
         (report_id, measure_type, target_person_id, target_org_id, decision_no, starts_on, ends_on, reflected_to_registration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [reportId, input.measureType, input.targetPersonId ?? null, input.targetOrgId ?? null,
       input.decisionNo ?? null, input.startsOn ?? null, input.endsOn ?? null, reflected]
    )).rows[0];

    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'integrity', entityTable: 'measure', entityId: m.id,
        action: 'RECORD_MEASURE',
        after: { report: reportId, type: input.measureType, target_person: input.targetPersonId ?? null, reflected } },
      client
    );
    return m.id;
  });
}

/** 종결(CLOSED). publish=true 면 비식별 요약을 공개(pub.integrity_case)한다. */
export async function closeReport(
  reportId: UUID, input: { publish?: boolean; publicSummaryI18n?: I18nText | null }, actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE integrity.report
          SET status = 'CLOSED', closed_at = now(),
              published = $2, public_summary_i18n = CASE WHEN $2 THEN $3::jsonb ELSE public_summary_i18n END
        WHERE id = $1`,
      [reportId, input.publish ?? false, input.publicSummaryI18n ? JSON.stringify(input.publicSummaryI18n) : null]
    );
    await logAction(client, reportId, 'CLOSE', null, actor);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'integrity', entityTable: 'report', entityId: reportId,
        action: 'CLOSE', after: { status: 'CLOSED', published: input.publish ?? false } },
      client
    );
  });
}

// ── 집계 (대시보드/큐 상단) ───────────────────────────────────────────────

export interface IntegrityStats {
  total: number;
  open: number;
  byStatus: Array<{ status: ReportStatus; n: number }>;
  byCategory: Array<{ category: IntegrityCategory; n: number }>;
}
export async function getIntegrityStats(): Promise<IntegrityStats> {
  const byStatus = await query<{ status: ReportStatus; n: string }>(
    `SELECT status, count(*)::text AS n FROM integrity.report GROUP BY status`
  );
  const byCategory = await query<{ category: IntegrityCategory; n: string }>(
    `SELECT category, count(*)::text AS n FROM integrity.report GROUP BY category`
  );
  const total = byStatus.reduce((a, s) => a + Number(s.n), 0);
  const open = byStatus
    .filter((s) => ['RECEIVED', 'SCREENING', 'INVESTIGATING', 'DECIDED'].includes(s.status))
    .reduce((a, s) => a + Number(s.n), 0);
  return {
    total, open,
    byStatus: byStatus.map((s) => ({ status: s.status, n: Number(s.n) })),
    byCategory: byCategory.map((c) => ({ category: c.category, n: Number(c.n) })),
  };
}
