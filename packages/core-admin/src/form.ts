/**
 * 동적 폼 엔진 — DB 접근 계층.
 * 순수 로직(타입/검증/조건부표시)은 form-schema.ts에 있고 여기서 다시 내보낸다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { FormDefinition, FormField, FormWithFields } from './form-schema';
import { claimAttachments } from './storage';

export * from './form-schema';

/**
 * 사용할 폼을 고른다.
 * 우선순위: 조직 전용 → 종목 전용 → 전국 표준.
 * 협회가 자기 서식을 갖고 있어도 중앙 표준을 기본으로 쓸 수 있게 한다.
 */
export async function getForm(
  code: string,
  opts: { orgId?: UUID | null; sportId?: UUID | null } = {}
): Promise<FormWithFields | null> {
  const def = await queryOne<FormDefinition>(
    `SELECT * FROM core.form_definition
      WHERE code = $1 AND status = 'ACTIVE'
        AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
        AND (effective_to   IS NULL OR effective_to   >= CURRENT_DATE)
        AND (org_id   IS NULL OR org_id   = $2::uuid)
        AND (sport_id IS NULL OR sport_id = $3::uuid)
      ORDER BY (org_id   = $2::uuid) DESC NULLS LAST,
               (sport_id = $3::uuid) DESC NULLS LAST,
               version DESC
      LIMIT 1`,
    [code, opts.orgId ?? null, opts.sportId ?? null]
  );
  if (!def) return null;

  const fields = await query<FormField>(
    `SELECT * FROM core.form_field WHERE form_id = $1 ORDER BY sort_order, field_key`,
    [def.id]
  );
  return { ...def, fields };
}

export interface SubmissionInput {
  formId: UUID;
  subjectType?: string | null;
  subjectId?: UUID | null;
  submitterPersonId?: UUID | null;
  submitterOrgId?: UUID | null;
  data: Record<string, unknown>;
  /** 작성 중 올려둔 첨부. 제출이 성공한 뒤에야 이 신청서 소유가 된다. */
  attachmentIds?: UUID[];
}

export interface Submission {
  id: UUID;
  form_id: UUID;
  doc_no: string | null;
  subject_type: string | null;
  subject_id: UUID | null;
  submitter_person_id: UUID | null;
  submitter_org_id: UUID | null;
  data: Record<string, unknown>;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  due_at: string | null;
  created_at: string;
}

/**
 * 신청서 제출.
 * 법정 처리기한(sla_days)이 있으면 마감 시각을 자동 계산한다.
 * 예: 대회 개최 신청은 베트남 체육법상 서류 접수 후 10일 이내 결정.
 */
export async function submitForm(input: SubmissionInput): Promise<Submission> {
  return tx(async (client) => {
    const res = await client.query<Submission>(
      `INSERT INTO core.form_submission
         (form_id, subject_type, subject_id, submitter_person_id, submitter_org_id,
          data, status, submitted_at, due_at)
       SELECT $1, $2, $3, $4, $5, $6::jsonb, 'SUBMITTED', now(),
              CASE WHEN f.sla_days IS NULL THEN NULL
                   ELSE now() + (f.sla_days || ' days')::interval END
         FROM core.form_definition f WHERE f.id = $1
       RETURNING *`,
      [
        input.formId,
        input.subjectType ?? null,
        input.subjectId ?? null,
        input.submitterPersonId ?? null,
        input.submitterOrgId ?? null,
        JSON.stringify(input.data),
      ]
    );
    const sub = res.rows[0];

    // 첨부를 이 신청서 소유로 옮긴다. 같은 트랜잭션 안이라 제출이 실패하면 첨부도 옮겨지지 않는다.
    if (input.attachmentIds?.length) {
      const claimed = await claimAttachments(
        input.attachmentIds,
        'SUBMISSION',
        sub.id,
        input.submitterPersonId ?? null,
        client
      );
      // 하나라도 못 옮겼다면 그 id 는 본인이 올린 임시 첨부가 아니다.
      // 그대로 두면 첨부가 없는 신청서가 "서류 냈음"으로 결재에 올라간다.
      if (claimed !== input.attachmentIds.length) {
        throw new Error('ATTACHMENT_NOT_CLAIMED');
      }
    }

    await writeAudit(
      {
        actorPersonId: input.submitterPersonId,
        actorOrgId: input.submitterOrgId,
        entitySchema: 'core',
        entityTable: 'form_submission',
        entityId: sub.id,
        action: 'SUBMIT',
        after: { form_id: sub.form_id, status: sub.status },
      },
      client
    );
    return sub;
  });
}

/** 한 사람이 낸 신청서 — 회원 서비스의 "신청 이력" (한국 g1 '내 생애주기'의 신청이력) */
export async function listSubmissionsBy(personId: UUID, limit = 50) {
  return query<Submission & { form_code: string; form_title: Record<string, string> }>(
    `SELECT fs.*, fd.code AS form_code, fd.title_i18n AS form_title
       FROM core.form_submission fs
       JOIN core.form_definition fd ON fd.id = fs.form_id
      WHERE fs.submitter_person_id = $1
      ORDER BY fs.created_at DESC
      LIMIT $2`,
    [personId, limit]
  );
}

export async function getSubmission(id: UUID): Promise<Submission | null> {
  return queryOne<Submission>(`SELECT * FROM core.form_submission WHERE id = $1`, [id]);
}
