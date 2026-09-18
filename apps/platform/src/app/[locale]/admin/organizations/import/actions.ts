'use server';

import { revalidatePath } from 'next/cache';
import {
  validateOrgImportAttachment, commitOrgImport, type UUID, type OrgValidationResult,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/**
 * 조직 일괄 등록 액션 (검증 → 확정). 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다.
 * 검증은 아무것도 저장하지 않고, 확정만 실제로 넣는다(사람이 미리보기 후 누른다).
 */

export async function validateOrgAction(locale: string, attachmentId: string): Promise<OrgValidationResult> {
  await requireWorkspace(locale);
  return validateOrgImportAttachment(attachmentId as UUID);
}

export async function commitOrgAction(
  locale: string,
  attachmentId: string
): Promise<{ inserted: number; skipped: number }> {
  const user = await requireWorkspace(locale);
  const res = await commitOrgImport(attachmentId as UUID, {
    personId: user.personId,
    orgId: user.activeOrgId,
  });
  revalidatePath(`/${locale}/admin/organizations`);
  return { inserted: res.inserted, skipped: res.skipped };
}
