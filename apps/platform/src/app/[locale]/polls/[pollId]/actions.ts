'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { castVote, toggleCheer, type UUID, type CheerTarget } from '@vsp/core-admin';
import { requireMember } from '@/lib/session';

/** 회원 투표·응원 액션. 항상 세션 account 로만 기록한다. */

export async function voteForm(locale: string, pollId: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  const optionId = String(formData.get('option_id') ?? '') as UUID;
  if (user.accountId && optionId) {
    try {
      await castVote(pollId as UUID, optionId, user.accountId);
    } catch {
      redirect(`/${locale}/polls/${pollId}?err=1`);
    }
  }
  revalidatePath(`/${locale}/polls/${pollId}`);
  redirect(`/${locale}/polls/${pollId}?voted=1`);
}

export async function cheerForm(locale: string, pollId: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  const type = String(formData.get('target_type') ?? '') as CheerTarget;
  const id = String(formData.get('target_id') ?? '') as UUID;
  if (user.accountId && id && ['PERSON', 'TEAM', 'EVENT', 'ARTICLE'].includes(type)) {
    await toggleCheer(type, id, user.accountId);
  }
  revalidatePath(`/${locale}/polls/${pollId}`);
  redirect(`/${locale}/polls/${pollId}`);
}
