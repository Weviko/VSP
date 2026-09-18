'use server';

import {
  getForm, validateSubmission, submitForm, startWorkflow, attachmentIdsIn, type UUID,
} from '@vsp/core-admin';
import type { ValidationError } from '@vsp/core-admin';
import { workUserOrNull } from '@/lib/session';

/**
 * 선수 등록 신청 제출.
 *
 * 주의: 클라이언트 검증은 편의일 뿐이므로 서버에서 반드시 다시 검증한다.
 * 제출이 성공하면 곧바로 결재선(기본 2단계)을 시작한다.
 */
export async function submitAthleteRegistration(
  data: Record<string, unknown>
): Promise<{ ok: boolean; submissionId?: string; errors?: ValidationError[]; message?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, message: 'FORBIDDEN' };
  try {
    const form = await getForm('ATHLETE_REG');
    if (!form) return { ok: false, message: 'form definition not found' };

    const errors = validateSubmission(form, data);
    if (errors.length) return { ok: false, errors };

    const submission = await submitForm({
      formId: form.id,
      subjectType: 'PERSON',
      submitterPersonId: user.personId,
      submitterOrgId: user.activeOrgId,
      // 첨부 id 는 서식 정의를 따라 서버에서 다시 뽑는다 — 화면이 보낸 목록을 믿지 않는다.
      attachmentIds: attachmentIdsIn(form, data) as UUID[],
      data,
    });

    await startWorkflow(submission.id, form.code, null);

    return { ok: true, submissionId: submission.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
