'use server';

import { revalidatePath } from 'next/cache';
import {
  createForm, cloneFormAsNewVersion, upsertField, deleteField,
  reorderFields, setFormStatus, type UUID, type FieldType,
} from '@vsp/core-admin';
import { workUserOrNull } from '@/lib/session';

type R = { ok: boolean; id?: string; error?: string };

export async function createFormAction(input: {
  code: string; titleVi: string; titleKo?: string; slaDays?: number | null; locale: string;
}): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const f = await createForm(
      {
        code: input.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        titleI18n: { vi: input.titleVi, ...(input.titleKo ? { ko: input.titleKo } : {}) },
        slaDays: input.slaDays ?? null,
      },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );
    revalidatePath(`/${input.locale}/admin/settings`);
    return { ok: true, id: f.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 운영 중인 서식은 직접 고치지 않고 새 버전으로 복제해 수정한다 */
export async function cloneFormAction(formId: string, locale: string): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const f = await cloneFormAsNewVersion(formId as UUID, { personId: user?.personId });
    revalidatePath(`/${locale}/admin/settings`);
    return { ok: true, id: f.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveFieldAction(input: {
  formId: string;
  fieldKey: string;
  labelVi: string;
  labelKo?: string;
  dataType: string;
  isRequired: boolean;
  section?: string;
  sortOrder?: number;
  optionsText?: string;
  locale: string;
}): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    // 선택지는 "값=표시문구" 를 줄바꿈으로 입력받는다. 관리자가 쓰기 가장 쉬운 형식이다.
    const options = input.optionsText?.trim()
      ? input.optionsText.split('\n').map((line) => {
          const [value, label] = line.split('=').map((x) => x.trim());
          return { value: value ?? '', label_i18n: { vi: label ?? value ?? '' } };
        }).filter((o) => o.value)
      : null;

    await upsertField({
      formId: input.formId as UUID,
      fieldKey: input.fieldKey.trim().replace(/[^a-zA-Z0-9_]/g, '_'),
      labelI18n: { vi: input.labelVi, ...(input.labelKo ? { ko: input.labelKo } : {}) },
      dataType: input.dataType as FieldType,
      isRequired: input.isRequired,
      section: input.section || null,
      sortOrder: input.sortOrder ?? 0,
      options,
    });
    revalidatePath(`/${input.locale}/admin/settings/forms/${input.formId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteFieldAction(
  fieldId: string, formId: string, locale: string
): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await deleteField(fieldId as UUID);
    revalidatePath(`/${locale}/admin/settings/forms/${formId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function moveFieldAction(
  formId: string, orderedIds: string[], locale: string
): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await reorderFields(formId as UUID, orderedIds as UUID[]);
    revalidatePath(`/${locale}/admin/settings/forms/${formId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setFormStatusAction(
  formId: string, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED', locale: string
): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await setFormStatus(formId as UUID, status, { personId: user?.personId });
    revalidatePath(`/${locale}/admin/settings`);
    revalidatePath(`/${locale}/admin/settings/forms/${formId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
