/**
 * AI 문서 등록.
 *
 * 서류(PDF·스캔·사진)가 올라오면 → AI 가 읽어 베트남 체육회 공식 폼의 항목으로 채운다
 * → 사람이 검토·승인(전자결재). AI 는 초안을 채울 뿐 최종 결정을 하지 않는다.
 *
 * 설계 원칙 (바뀔 것에 대비):
 *   - 추출기는 어댑터로 갈아끼운다(알림·저장소와 같은 방식). LLM 사업자·모델이 바뀌어도 호출부는 그대로.
 *   - 어떤 공식 서식이 오든 붙는다. 대상은 form_definition 이고, 서식 코드에 묶지 않는다.
 *     서식이 도착하면 서식 편집기로 등록만 하면 이 파이프라인이 바로 그 서식으로 채운다.
 *   - 추출값은 항목별 신뢰도와 함께 남긴다. 감사와 검토 우선순위에 쓴다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import { readAttachment } from './storage';
import { getForm, type FormWithFields, type ValidationError } from './form';
import { validateSubmission, isFieldVisible } from './form-schema';
import { startWorkflow } from './workflow';
import type { UUID } from './types';
import type { Locale } from './i18n';

/** 추출 결과: 폼 항목값과 항목별 신뢰도(0~1). */
export interface ExtractionResult {
  fields: Record<string, unknown>;
  confidence: Record<string, number>;
}

export interface ExtractInput {
  data: Buffer;
  mimeType: string | null;
  fileName: string;
  form: FormWithFields;
  locale: Locale;
}

/** 추출기 어댑터. 운영에서는 LLM(문서→구조화) 어댑터를 등록한다. */
export interface Extractor {
  name: string;
  extract(input: ExtractInput): Promise<ExtractionResult>;
}

let current: Extractor | null = null;

/** 추출기를 등록한다. 등록 전에는 빈 초안만 만든다(아무것도 지어내지 않는다). */
export function registerExtractor(e: Extractor): void {
  current = e;
}

export function getExtractor(): Extractor {
  return current ?? NULL_EXTRACTOR;
}

/**
 * 기본 추출기 — 아무것도 추출하지 않는다.
 *
 * LLM 어댑터가 붙기 전에는 이걸 쓴다. 값을 지어내느니 빈 초안을 만들어
 * 사람이 채우게 한다. "AI 가 없어서 잘못 채우는" 사고를 원천 차단한다.
 */
export const NULL_EXTRACTOR: Extractor = {
  name: 'none',
  async extract() {
    return { fields: {}, confidence: {} };
  },
};

export interface IngestionJob {
  id: UUID;
  attachment_id: UUID;
  form_id: UUID;
  subject_type: string | null;
  submitter_person_id: UUID | null;
  submitter_org_id: UUID | null;
  extractor: string | null;
  extracted: Record<string, unknown>;
  confidence: Record<string, number>;
  overall_confidence: number | null;
  validation: ValidationError[];
  status: string;
  submission_id: UUID | null;
  error: string | null;
  created_at: string;
}

export interface IngestInput {
  attachmentId: UUID;
  /** 등록할 공식 폼 코드 (예: 'ATHLETE_REG'). 서식 편집기로 등록된 어떤 코드든 가능. */
  formCode: string;
  subjectType?: string | null;
  submitterPersonId?: UUID | null;
  submitterOrgId?: UUID | null;
  locale?: Locale;
}

/** 검토 우선순위·자동화 정도를 판단하는 데 쓰는, 신뢰도가 낮은 항목 목록 */
export function lowConfidenceFields(
  form: FormWithFields,
  data: Record<string, unknown>,
  confidence: Record<string, number>,
  threshold = 0.8
): string[] {
  const out: string[] = [];
  for (const f of form.fields) {
    if (!isFieldVisible(f, data)) continue;
    const c = confidence[f.field_key];
    // 필수인데 값이 없거나, 신뢰도가 낮으면 사람이 꼭 확인해야 한다
    const empty = data[f.field_key] === undefined || data[f.field_key] === null || data[f.field_key] === '';
    if ((f.is_required && empty) || (c !== undefined && c < threshold)) out.push(f.field_key);
  }
  return out;
}

/**
 * 서류 한 건을 읽어 공식 폼 초안으로 만든다.
 *
 * 결과는 검토 대기 상태(EXTRACTED)로 남고, 신청서(form_submission)는 아직 만들지 않는다.
 * 사람이 confirmIngestion 으로 확정해야 신청서가 제출되고 전자결재가 시작된다.
 */
export async function ingestDocument(input: IngestInput): Promise<IngestionJob> {
  const locale: Locale = input.locale ?? 'vi';
  const form = await getForm(input.formCode);
  if (!form) throw new Error(`form not found: ${input.formCode}`);

  const file = await readAttachment(input.attachmentId);
  if (!file) throw new Error('attachment not found');

  const extractor = getExtractor();
  let result: ExtractionResult = { fields: {}, confidence: {} };
  let error: string | null = null;
  try {
    result = await extractor.extract({
      data: file.data,
      mimeType: file.meta.mime_type,
      fileName: file.meta.file_name,
      form,
      locale,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 추출기가 서식에 없는 키를 반환할 수 있으니, 폼에 정의된 항목만 남긴다.
  const known = new Set(form.fields.map((f) => f.field_key));
  const fields: Record<string, unknown> = {};
  const confidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(result.fields)) {
    if (known.has(k)) fields[k] = v;
  }
  for (const [k, c] of Object.entries(result.confidence)) {
    if (known.has(k)) confidence[k] = c;
  }

  const validation = validateSubmission(form, fields);
  const confVals = Object.values(confidence);
  const overall = confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : 0;

  const rows = await query<IngestionJob>(
    `INSERT INTO core.ingestion_job
       (attachment_id, form_id, subject_type, submitter_person_id, submitter_org_id,
        extractor, extracted, confidence, overall_confidence, validation, status, error, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12,$4)
     RETURNING *`,
    [
      input.attachmentId, form.id, input.subjectType ?? null,
      input.submitterPersonId ?? null, input.submitterOrgId ?? null,
      extractor.name, JSON.stringify(fields), JSON.stringify(confidence),
      Number(overall.toFixed(3)),
      JSON.stringify(validation),
      error ? 'FAILED' : 'EXTRACTED',
      error,
    ]
  );

  await writeAudit({
    actorPersonId: input.submitterPersonId,
    entitySchema: 'core',
    entityTable: 'ingestion_job',
    entityId: rows[0].id,
    action: 'INGEST',
    after: { form: form.code, extractor: extractor.name, overall, failed: Boolean(error) },
  });

  return rows[0];
}

/**
 * 검토 확정 — 사람이 초안을 확인(필요 시 수정)하고 제출한다.
 *
 * 이 시점에 신청서가 SUBMITTED 로 만들어지고, 기존 전자결재선이 시작된다.
 * 즉 AI 가 채운 것을 사람이 승인하는 구조다. correctedData 로 수정본을 넘길 수 있다.
 */
export async function confirmIngestion(
  jobId: UUID,
  correctedData: Record<string, unknown> | null,
  actor: { personId?: UUID | null; orgId?: UUID | null }
): Promise<{ submissionId: UUID }> {
  return tx(async (client) => {
    const job = (
      await client.query<IngestionJob>(`SELECT * FROM core.ingestion_job WHERE id = $1`, [jobId])
    ).rows[0];
    if (!job) throw new Error('ingestion job not found');
    if (job.status === 'APPLIED') throw new Error('already applied');

    const def = (
      await client.query<{ code: string; sla_days: number | null }>(
        `SELECT code, sla_days FROM core.form_definition WHERE id = $1`,
        [job.form_id]
      )
    ).rows[0];

    const data = correctedData ?? job.extracted;

    const sub = (
      await client.query<{ id: UUID }>(
        `INSERT INTO core.form_submission
           (form_id, subject_type, submitter_person_id, submitter_org_id, data, status, submitted_at, due_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,'SUBMITTED', now(),
                 CASE WHEN $6::int IS NULL THEN NULL ELSE now() + ($6 || ' days')::interval END)
         RETURNING id`,
        [
          job.form_id, job.subject_type, actor.personId ?? job.submitter_person_id,
          actor.orgId ?? job.submitter_org_id, JSON.stringify(data), def?.sla_days ?? null,
        ]
      )
    ).rows[0];

    // 원본 서류를 이 신청서의 첨부로 연결한다 (증빙 보존)
    await client.query(
      `UPDATE core.attachment SET owner_type='SUBMISSION', owner_id=$1
        WHERE id=$2 AND deleted_at IS NULL`,
      [sub.id, job.attachment_id]
    );

    await client.query(
      `UPDATE core.ingestion_job SET status='APPLIED', submission_id=$1, updated_at=now() WHERE id=$2`,
      [sub.id, jobId]
    );

    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'core',
        entityTable: 'form_submission',
        entityId: sub.id,
        action: 'INGEST_CONFIRM',
        after: { from_job: jobId, edited: correctedData !== null },
      },
      client
    );

    return { submissionId: sub.id, formCode: def?.code, submitterOrgId: actor.orgId ?? job.submitter_org_id };
  }).then(async (r) => {
    // 결재선은 트랜잭션 밖에서 시작해도 되지만, 폼 코드로 워크플로를 찾아 건다.
    if (r.formCode) await startWorkflow(r.submissionId, r.formCode, r.submitterOrgId ?? null);
    return { submissionId: r.submissionId };
  });
}

/** 반려 — 추출이 틀렸거나 서류가 부적합할 때. 신청서를 만들지 않는다. */
export async function rejectIngestion(jobId: UUID, actor: { personId?: UUID | null } = {}): Promise<void> {
  await query(`UPDATE core.ingestion_job SET status='REJECTED', updated_at=now() WHERE id=$1`, [jobId]);
  await writeAudit({
    actorPersonId: actor.personId,
    entitySchema: 'core',
    entityTable: 'ingestion_job',
    entityId: jobId,
    action: 'INGEST_REJECT',
  });
}

/** 검토 대기 목록 (신뢰도 낮은 것 먼저) */
export async function listIngestionQueue(formId?: UUID): Promise<IngestionJob[]> {
  return query<IngestionJob>(
    `SELECT * FROM core.ingestion_job
      WHERE status = 'EXTRACTED' AND ($1::uuid IS NULL OR form_id = $1)
      ORDER BY overall_confidence ASC NULLS FIRST, created_at`,
    [formId ?? null]
  );
}

export async function getIngestionJob(id: UUID): Promise<IngestionJob | null> {
  return queryOne<IngestionJob>(`SELECT * FROM core.ingestion_job WHERE id = $1`, [id]);
}
