'use server';

import { redirect } from 'next/navigation';
import { submitProposal, SponsorshipError, type UUID } from '@vsp/core-admin';
import { requireMember } from '@/lib/session';

/**
 * 후원 제안 제출 (문서 06).
 *
 * 로그인한 회원만 제안을 넣는다. 대상 선수가 후원 가능(open)일 때만 통과한다(core-admin 가드).
 * 금액은 참고 텍스트일 뿐, 플랫폼은 결제를 처리하지 않는다. 제출 후 대상 선수만 연락처를 본다.
 */
export async function submitProposalForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  const athletePersonId = String(formData.get('athlete_person_id') ?? '') as UUID;
  const sponsorName = String(formData.get('sponsor_name') ?? '').trim();
  if (!athletePersonId || !sponsorName) {
    redirect(`/${locale}/sponsorship/propose?athlete=${athletePersonId}&err=INPUT`);
  }
  try {
    await submitProposal({
      athletePersonId,
      sponsorName,
      sponsorContact: String(formData.get('sponsor_contact') ?? '').trim() || null,
      message: String(formData.get('message') ?? '').trim() || null,
      budget: String(formData.get('budget') ?? '').trim() || null,
      submittedBy: user.personId ?? null,
    });
  } catch (e) {
    if (e instanceof SponsorshipError) {
      redirect(`/${locale}/sponsorship/propose?athlete=${athletePersonId}&err=${e.code}`);
    }
    throw e;
  }
  redirect(`/${locale}/sponsorship/propose?athlete=${athletePersonId}&sent=1`);
}
