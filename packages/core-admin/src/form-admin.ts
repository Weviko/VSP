/**
 * 서식 관리 (관리자용).
 *
 * 존재 이유가 분명하다. 동적 폼 엔진은 만들었지만 그것을 조작할 화면이 없으면
 * 체육회 서식을 받아도 개발자가 SQL로 넣어야 한다. 그러면
 * "협의 피드백을 코드 수정 없이 설정 변경으로 흡수한다"는 전략이 성립하지 않는다.
 *
 * 운영 중인 서식을 함부로 바꾸면 이미 제출된 신청서의 해석이 달라지므로,
 * 수정은 새 버전 생성으로 처리하고 기존 버전은 보존한다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';
import type { FormDefinition, FormField, FieldType } from './form-schema';

export interface FormSummary extends FormDefinition {
  field_count: number;
  submission_count: number;
}

export async function listForms(orgId?: UUID | null): Promise<FormSummary[]> {
  return query<FormSummary>(
    `SELECT fd.*,
            (SELECT count(*)::int FROM core.form_field ff WHERE ff.form_id = fd.id) AS field_count,
            (SELECT count(*)::int FROM core.form_submission fs WHERE fs.form_id = fd.id) AS submission_count
       FROM core.form_definition fd
      WHERE ($1::uuid IS NULL OR fd.org_id = $1 OR fd.org_id IS NULL)
      ORDER BY fd.code, fd.version DESC`,
    [orgId ?? null]
  );
}

export async function getFormById(
  id: UUID
): Promise<(FormDefinition & { fields: FormField[] }) | null> {
  const def = await queryOne<FormDefinition>(
    `SELECT * FROM core.form_definition WHERE id = $1`,
    [id]
  );
  if (!def) return null;
  const fields = await query<FormField>(
    `SELECT * FROM core.form_field WHERE form_id = $1 ORDER BY sort_order, field_key`,
    [id]
  );
  return { ...def, fields };
}

export interface CreateFormInput {
  code: string;
  titleI18n: I18nText;
  descriptionI18n?: I18nText | null;
  orgId?: UUID | null;
  sportId?: UUID | null;
  legalBasis?: string | null;
  slaDays?: number | null;
}

export async function createForm(
  input: CreateFormInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<FormDefinition> {
  return tx(async (client) => {
    // 같은 코드가 이미 있으면 다음 버전으로 만든다
    const prev = await client.query<{ v: number }>(
      `SELECT COALESCE(max(version), 0) AS v FROM core.form_definition WHERE code = $1`,
      [input.code]
    );
    const version = (prev.rows[0]?.v ?? 0) + 1;

    const res = await client.query<FormDefinition>(
      `INSERT INTO core.form_definition
         (code, version, org_id, sport_id, title_i18n, description_i18n,
          legal_basis, sla_days, status, effective_from)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,'DRAFT',CURRENT_DATE)
       RETURNING *`,
      [
        input.code,
        version,
        input.orgId ?? null,
        input.sportId ?? null,
        JSON.stringify(input.titleI18n),
        input.descriptionI18n ? JSON.stringify(input.descriptionI18n) : null,
        input.legalBasis ?? null,
        input.slaDays ?? null,
      ]
    );
    const form = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'core',
        entityTable: 'form_definition',
        entityId: form.id,
        action: 'INSERT',
        after: { code: input.code, version },
      },
      client
    );
    return form;
  });
}

/**
 * 운영 중인 서식을 복제해 새 버전을 만든다.
 * 이미 제출된 신청서는 옛 버전을 참조하므로 해석이 바뀌지 않는다.
 */
export async function cloneFormAsNewVersion(
  formId: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<FormDefinition> {
  return tx(async (client) => {
    const src = (
      await client.query<FormDefinition>(`SELECT * FROM core.form_definition WHERE id = $1`, [formId])
    ).rows[0];
    if (!src) throw new Error('form not found');

    const prev = await client.query<{ v: number }>(
      `SELECT COALESCE(max(version), 0) AS v FROM core.form_definition WHERE code = $1`,
      [src.code]
    );
    const version = (prev.rows[0]?.v ?? 0) + 1;

    const res = await client.query<FormDefinition>(
      `INSERT INTO core.form_definition
         (code, version, org_id, sport_id, title_i18n, description_i18n,
          legal_basis, sla_days, layout, status, effective_from)
       SELECT code, $2, org_id, sport_id, title_i18n, description_i18n,
              legal_basis, sla_days, layout, 'DRAFT', CURRENT_DATE
         FROM core.form_definition WHERE id = $1
       RETURNING *`,
      [formId, version]
    );
    const newForm = res.rows[0];

    await client.query(
      `INSERT INTO core.form_field
         (form_id, field_key, label_i18n, help_i18n, data_type, is_required,
          options, validation, visible_when, default_value, bind_to, section, sort_order)
       SELECT $2, field_key, label_i18n, help_i18n, data_type, is_required,
              options, validation, visible_when, default_value, bind_to, section, sort_order
         FROM core.form_field WHERE form_id = $1`,
      [formId, newForm.id]
    );

    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'core',
        entityTable: 'form_definition',
        entityId: newForm.id,
        action: 'CLONE',
        after: { from: formId, version },
      },
      client
    );
    return newForm;
  });
}

export interface UpsertFieldInput {
  formId: UUID;
  fieldKey: string;
  labelI18n: I18nText;
  helpI18n?: I18nText | null;
  dataType: FieldType;
  isRequired: boolean;
  section?: string | null;
  sortOrder?: number;
  options?: Array<{ value: string; label_i18n: I18nText }> | null;
  validation?: Record<string, unknown> | null;
  visibleWhen?: Record<string, unknown> | null;
  bindTo?: string | null;
}

export async function upsertField(input: UpsertFieldInput): Promise<FormField> {
  const rows = await query<FormField>(
    `INSERT INTO core.form_field
       (form_id, field_key, label_i18n, help_i18n, data_type, is_required,
        options, validation, visible_when, bind_to, section, sort_order)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12)
     ON CONFLICT (form_id, field_key) DO UPDATE SET
       label_i18n   = EXCLUDED.label_i18n,
       help_i18n    = EXCLUDED.help_i18n,
       data_type    = EXCLUDED.data_type,
       is_required  = EXCLUDED.is_required,
       options      = EXCLUDED.options,
       validation   = EXCLUDED.validation,
       visible_when = EXCLUDED.visible_when,
       bind_to      = EXCLUDED.bind_to,
       section      = EXCLUDED.section,
       sort_order   = EXCLUDED.sort_order
     RETURNING *`,
    [
      input.formId,
      input.fieldKey,
      JSON.stringify(input.labelI18n),
      input.helpI18n ? JSON.stringify(input.helpI18n) : null,
      input.dataType,
      input.isRequired,
      input.options ? JSON.stringify(input.options) : null,
      input.validation ? JSON.stringify(input.validation) : null,
      input.visibleWhen ? JSON.stringify(input.visibleWhen) : null,
      input.bindTo ?? null,
      input.section ?? null,
      input.sortOrder ?? 0,
    ]
  );
  return rows[0];
}

export async function deleteField(fieldId: UUID): Promise<void> {
  await query(`DELETE FROM core.form_field WHERE id = $1`, [fieldId]);
}

export async function reorderFields(formId: UUID, orderedIds: UUID[]): Promise<void> {
  await tx(async (client) => {
    for (const [i, id] of orderedIds.entries()) {
      await client.query(
        `UPDATE core.form_field SET sort_order = $3 WHERE id = $1 AND form_id = $2`,
        [id, formId, (i + 1) * 10]
      );
    }
  });
}

/**
 * 서식 상태 변경.
 * ACTIVE 로 올릴 때 같은 코드의 다른 버전은 ARCHIVED 로 내린다.
 * 두 버전이 동시에 활성이면 어느 것이 쓰일지 예측할 수 없기 때문이다.
 */
export async function setFormStatus(
  formId: UUID,
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
  actor: { personId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    if (status === 'ACTIVE') {
      await client.query(
        `UPDATE core.form_definition
            SET status = 'ARCHIVED', effective_to = CURRENT_DATE
          WHERE code = (SELECT code FROM core.form_definition WHERE id = $1)
            AND id <> $1 AND status = 'ACTIVE'`,
        [formId]
      );
    }
    await client.query(`UPDATE core.form_definition SET status = $2 WHERE id = $1`, [
      formId,
      status,
    ]);
    await writeAudit(
      {
        actorPersonId: actor.personId,
        entitySchema: 'core',
        entityTable: 'form_definition',
        entityId: formId,
        action: 'STATUS_CHANGE',
        after: { status },
      },
      client
    );
  });
}
