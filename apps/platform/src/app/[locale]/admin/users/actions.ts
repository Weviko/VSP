'use server';

import { redirect } from 'next/navigation';
import {
  assignRole, endMembership, searchPersons, searchOrgs, AccessError,
  t as pick, type UUID, type PersonHit,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

// 권한 배정/회수는 최고관리자·정부관리자만.
const CAN_MANAGE = ['SYS_ADMIN', 'GOV_ADMIN'];

export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}

export async function searchOrgsAction(
  locale: string,
  q: string
): Promise<Array<{ id: string; label: string; sub?: string }>> {
  await requireWorkspace(locale);
  const hits = await searchOrgs(q, { limit: 10 });
  return hits.map((o) => ({
    id: o.id,
    label: pick(o.name_i18n, locale as 'vi' | 'en' | 'ko'),
    sub: o.display_id ?? o.region_code ?? undefined,
  }));
}

export async function assignRoleForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  if (!user.roleCodes.some((r) => CAN_MANAGE.includes(r))) redirect(`/${locale}/admin/users?err=FORBIDDEN`);
  const personId = String(formData.get('person_id') ?? '').trim();
  const orgId = String(formData.get('org_id') ?? '').trim();
  const roleCode = String(formData.get('role_code') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim() || null;
  if (!personId || !orgId || !roleCode) redirect(`/${locale}/admin/users?err=INPUT`);
  try {
    await assignRole(
      { personId: personId as UUID, orgId: orgId as UUID, roleCode, title },
      { personId: user.personId ?? null, orgId: user.activeOrgId ?? null }
    );
  } catch (e) {
    if (e instanceof AccessError) redirect(`/${locale}/admin/users?err=${e.code}`);
    throw e;
  }
  redirect(`/${locale}/admin/users?added=1`);
}

export async function revokeRoleForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  if (!user.roleCodes.some((r) => CAN_MANAGE.includes(r))) redirect(`/${locale}/admin/users?err=FORBIDDEN`);
  const memberId = String(formData.get('member_id') ?? '').trim();
  if (memberId) {
    await endMembership(memberId as UUID, { personId: user.personId ?? null, orgId: user.activeOrgId ?? null });
  }
  redirect(`/${locale}/admin/users?revoked=1`);
}
