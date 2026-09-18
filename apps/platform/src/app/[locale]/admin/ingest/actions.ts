'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  ingestDocument, confirmIngestion, rejectIngestion,
  getFormById, validateSubmission,
  type UUID, type ValidationError,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';
// 부수효과: 기본 추출기를 등록한다 (이 액션이 로드되면 등록이 보장된다)
import '@/lib/adapters';

/**
 * AI 서류 등록 액션.
 *
 * 모든 액션은 공개 종단점이므로 화면과 별개로 requireWorkspace 로 업무 권한을 확인한다.
 * AI 는 초안만 만든다: 확정(confirm)해야 신청서가 제출되고 전자결재가 시작된다(자동 승인 없음).
 */

/** 업로드된 서류 한 건을 골라 공식 폼 초안으로 추출한다. 성공하면 검토 화면으로 보낸다. */
export async function startIngestAction(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const attachmentId = String(formData.get('attachment_id') ?? '') as UUID;
  const formCode = String(formData.get('form_code') ?? '');
  if (!attachmentId || !formCode) redirect(`/${locale}/admin/ingest?err=INPUT`);

  const job = await ingestDocument({
    attachmentId,
    formCode,
    submitterPersonId: user.personId,
    submitterOrgId: user.activeOrgId,
    locale: locale as 'vi' | 'ko' | 'en',
  });
  revalidatePath(`/${locale}/admin/ingest`);
  redirect(`/${locale}/admin/ingest/${job.id}`);
}

/**
 * 검토 확정 — 사람이 초안을 확인·수정하고 제출한다.
 * 제출 전에 공식 폼 검증을 다시 돌려, 필수 누락 등이 있으면 확정하지 않고 화면에서 고치게 한다.
 */
export async function confirmIngestAction(
  locale: string,
  jobId: string,
  formId: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; submissionId?: string; errors?: ValidationError[]; message?: string }> {
  const user = await requireWorkspace(locale);
  const form = await getFormById(formId as UUID);
  if (!form) return { ok: false, message: 'FORM_NOT_FOUND' };

  const errors = validateSubmission(form, data);
  if (errors.length) return { ok: false, errors };

  try {
    const res = await confirmIngestion(jobId as UUID, data, {
      personId: user.personId,
      orgId: user.activeOrgId,
    });
    revalidatePath(`/${locale}/admin/ingest`);
    revalidatePath(`/${locale}/admin/approvals`);
    return { ok: true, submissionId: res.submissionId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 반려 — 추출이 틀렸거나 서류가 부적합할 때. 신청서를 만들지 않는다. */
export async function rejectIngestAction(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const jobId = String(formData.get('job_id') ?? '') as UUID;
  if (jobId) await rejectIngestion(jobId, { personId: user.personId });
  revalidatePath(`/${locale}/admin/ingest`);
  redirect(`/${locale}/admin/ingest`);
}
