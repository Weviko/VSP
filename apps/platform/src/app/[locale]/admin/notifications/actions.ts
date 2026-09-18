'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  flushNotifications, queueDeadlineReminders, queueNotification, searchPersons,
  type UUID, type Channel, type PersonHit,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';
// 부수효과: 알림 어댑터(Zalo ZNS / 콘솔)를 등록한다. 이게 로드돼야 flush 가 실제로 발송한다.
import '@/lib/adapters';

/** 사람 선택기(PersonPicker)용 검색. */
export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}

/** 담당자가 특정 사람에게 자유 문구 알림을 큐에 넣는다(발송은 flush). */
export async function composeNotificationForm(locale: string, formData: FormData): Promise<void> {
  await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  const message = String(formData.get('message') ?? '').trim();
  const channel = String(formData.get('channel') ?? 'ZALO').trim() as Channel;
  if (personId && message) {
    await queueNotification({
      personId: personId as UUID,
      channel: ['ZALO', 'SMS', 'EMAIL', 'PUSH', 'INAPP'].includes(channel) ? channel : 'ZALO',
      templateCode: 'CUSTOM',
      vars: { message },
      locale: locale as 'vi' | 'en' | 'ko',
    });
  }
  revalidatePath(`/${locale}/admin/notifications`);
  redirect(`/${locale}/admin/notifications`);
}

/**
 * 알림 큐 운영 액션. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다.
 * flush 는 실제 발송(되돌릴 수 없음)이므로 화면에서 담당자가 명시적으로 확인 후 누른다.
 */

export async function flushAction(locale: string): Promise<{ sent: number; failed: number; skipped: number }> {
  await requireWorkspace(locale);
  const r = await flushNotifications(200);
  revalidatePath(`/${locale}/admin/notifications`);
  return r;
}

/** 기한 알림을 큐에 넣는다(발송 아님). 정산·회신·참가마감 기한을 훑어 담당자에게. */
export async function enqueueRemindersAction(locale: string): Promise<{ queued: number }> {
  await requireWorkspace(locale);
  const n = await queueDeadlineReminders(7);
  revalidatePath(`/${locale}/admin/notifications`);
  return { queued: n };
}
