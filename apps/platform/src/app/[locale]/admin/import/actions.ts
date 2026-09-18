'use server';

import { revalidatePath } from 'next/cache';
import {
  validateImportAttachment, commitPersonImport, type UUID, type ValidationResult,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/**
 * 엑셀 일괄 등록 액션 (검증 → 확정). 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다.
 * 검증은 아무것도 저장하지 않고, 확정만 실제로 넣는다(사람이 미리보기 후 누른다).
 */

export async function validateAction(locale: string, attachmentId: string): Promise<ValidationResult> {
  await requireWorkspace(locale);
  return validateImportAttachment(attachmentId as UUID);
}

export async function commitAction(
  locale: string,
  attachmentId: string
): Promise<{ inserted: number; skipped: number }> {
  const user = await requireWorkspace(locale);
  const res = await commitPersonImport(attachmentId as UUID, { personId: user.personId });
  revalidatePath(`/${locale}/admin/people`);
  return { inserted: res.inserted, skipped: res.skipped };
}
