'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createPerson, type UUID } from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

const GENDERS = new Set(['M', 'F', 'X', '']);

/** 인물 신규 등록(단건). 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다. */
export async function createPersonForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const fullName = String(formData.get('full_name') ?? '').trim();
  if (!fullName) redirect(`/${locale}/admin/people/new`);
  const g = String(formData.get('gender') ?? '').trim();
  const person = await createPerson(
    {
      fullName,
      nameLatin: String(formData.get('name_latin') ?? '').trim() || null,
      gender: GENDERS.has(g) ? (g || null) : null,
      birthDate: String(formData.get('birth_date') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      address: String(formData.get('address') ?? '').trim() || null,
      cccd: String(formData.get('cccd') ?? '').trim() || null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  revalidatePath(`/${locale}/admin/people`);
  redirect(`/${locale}/admin/people/${person.id as UUID}`);
}
