'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { approveRegistration, rejectRegistration } from '@vsp/sport-domain';
import type { UUID } from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/**
 * 등록 처리 액션 — 승인/반려. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다.
 * 정식 절차는 전자결재(결재함)지만, 담당자가 상세 화면에서 직접 처리할 수도 있다(감사기록 남김).
 */
export async function approveRegistrationForm(locale: string, regId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await approveRegistration(regId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/registrations/${regId}`);
  redirect(`/${locale}/admin/registrations/${regId}`);
}

export async function rejectRegistrationForm(locale: string, regId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const reason = String(formData.get('reason') ?? '').trim() || null;
  await rejectRegistration(regId as UUID, { personId: user.personId, orgId: user.activeOrgId }, reason);
  revalidatePath(`/${locale}/admin/registrations/${regId}`);
  redirect(`/${locale}/admin/registrations/${regId}`);
}
