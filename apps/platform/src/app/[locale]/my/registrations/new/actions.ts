'use server';

import {
  getForm, validateSubmission, submitForm, startWorkflow, attachmentIdsIn,
  type UUID, type ValidationError,
} from '@vsp/core-admin';
import { requireMember } from '@/lib/session';

/**
 * 회원 셀프 경기인 등록 신청.
 *
 * 가정: 회원(선수)이 본인 명의로, 소속 단체(폼의 team = org)를 골라 신청한다.
 * 제출자=본인, 제출 조직=선택한 단체. 이후 기존 2단계 전자결재로 승인된다(스태프 대행과 같은 결재선).
 * 클라이언트 검증은 편의일 뿐이므로 서버에서 반드시 다시 검증한다.
 */
export async function submitMyRegistration(
  locale: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; submissionId?: string; errors?: ValidationError[]; message?: string }> {
  const user = await requireMember(locale);
  if (!user.personId) return { ok: false, message: 'NO_PERSON' };
  try {
    const form = await getForm('ATHLETE_REG');
    if (!form) return { ok: false, message: 'form definition not found' };

    const errors = validateSubmission(form, data);
    if (errors.length) return { ok: false, errors };

    const orgId = (data.team as UUID) || null;
    const submission = await submitForm({
      formId: form.id,
      subjectType: 'PERSON',
      submitterPersonId: user.personId,
      submitterOrgId: orgId,
      // 첨부 id 는 서식 정의를 따라 서버에서 다시 뽑는다 — 화면이 보낸 목록을 믿지 않는다.
      attachmentIds: attachmentIdsIn(form, data) as UUID[],
      data,
    });

    await startWorkflow(submission.id, form.code, orgId);
    return { ok: true, submissionId: submission.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
