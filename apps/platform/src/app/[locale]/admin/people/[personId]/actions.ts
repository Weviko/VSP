'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { updatePerson, deactivatePerson, reactivatePerson, type UUID } from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/**
 * 인물 수정·비활성 액션. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다.
 * 신분증 해시는 여기서 다루지 않는다(신원 확인은 별도 절차). 모든 변경은 감사기록에 남는다.
 */

const GENDERS = new Set(['M', 'F', 'X', '']);

export async function updatePersonForm(locale: string, personId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const g = String(formData.get('gender') ?? '').trim();
  await updatePerson(
    personId as UUID,
    {
      full_name: String(formData.get('full_name') ?? '').trim(),
      name_latin: String(formData.get('name_latin') ?? '').trim() || null,
      gender: GENDERS.has(g) ? (g || null) : null,
      birth_date: String(formData.get('birth_date') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      address: String(formData.get('address') ?? '').trim() || null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  revalidatePath(`/${locale}/admin/people/${personId}`);
  redirect(`/${locale}/admin/people/${personId}`);
}

export async function deactivatePersonForm(locale: string, personId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await deactivatePerson(personId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/people`);
  redirect(`/${locale}/admin/people/${personId}`);
}

export async function reactivatePersonForm(locale: string, personId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await reactivatePerson(personId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/people/${personId}`);
  redirect(`/${locale}/admin/people/${personId}`);
}
