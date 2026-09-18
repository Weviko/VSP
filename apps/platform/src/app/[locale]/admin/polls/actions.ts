'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createPoll, addPollOption, deletePollOption, setPollStatus, type UUID, type PollStatus,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/** 투표 선택지 삭제(개시 전 정리). */
export async function deleteOptionForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('option_id') ?? '').trim();
  if (id) await deletePollOption(id as UUID, user.personId);
  revalidatePath(`/${locale}/admin/polls`);
  redirect(`/${locale}/admin/polls`);
}

/** 팬 투표 관리 액션 (생성·선택지·개폐). 모두 requireWorkspace. */

export async function createPollForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const title = String(formData.get('title') ?? '').trim();
  const eventId = String(formData.get('event_id') ?? '').trim();
  if (title) {
    await createPoll(
      { titleI18n: { [locale]: title }, pollType: 'MVP', eventId: (eventId as UUID) || null },
      user.personId
    );
  }
  revalidatePath(`/${locale}/admin/polls`);
  redirect(`/${locale}/admin/polls`);
}

export async function addOptionForm(locale: string, formData: FormData): Promise<void> {
  await requireWorkspace(locale);
  const pollId = String(formData.get('poll_id') ?? '') as UUID;
  const label = String(formData.get('label') ?? '').trim();
  if (pollId && label) {
    await addPollOption(pollId, { labelI18n: { [locale]: label } });
  }
  revalidatePath(`/${locale}/admin/polls`);
  redirect(`/${locale}/admin/polls`);
}

export async function setPollStatusForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const pollId = String(formData.get('poll_id') ?? '') as UUID;
  const status = String(formData.get('status') ?? '') as PollStatus;
  if (pollId && ['DRAFT', 'OPEN', 'CLOSED'].includes(status)) {
    await setPollStatus(pollId, status, user.personId);
  }
  revalidatePath(`/${locale}/admin/polls`);
  redirect(`/${locale}/admin/polls`);
}
