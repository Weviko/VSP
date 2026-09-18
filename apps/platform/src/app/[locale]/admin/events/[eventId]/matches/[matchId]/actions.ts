'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addRelay, deleteRelay, addVideo, setVideoStatus, deleteVideo, type UUID,
} from '@vsp/core-admin';
import { recordMatchResult } from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

/**
 * 경기 콘텐츠 작성 액션 (문자중계·영상).
 *
 * 모두 공개된 HTTP 종단점이므로 화면과 별개로 requireWorkspace 로 업무 권한을 확인한다.
 * 공개 노출 여부는 pub 뷰가 경기/대회의 공개 상태로 다시 거른다 — 여기서는 작성만.
 */
function back(locale: string, eventId: string, matchId: string, hash = ''): never {
  redirect(`/${locale}/admin/events/${eventId}/matches/${matchId}${hash}`);
}

export async function addRelayForm(locale: string, eventId: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const text = String(formData.get('text') ?? '').trim();
  if (text) {
    await addRelay(
      matchId as UUID,
      {
        clock: String(formData.get('clock') ?? '').trim() || null,
        side: String(formData.get('side') ?? '').trim() || null,
        kind: String(formData.get('kind') ?? 'INFO'),
        textI18n: { [locale]: text },
      },
      user.personId
    );
  }
  revalidatePath(`/${locale}/admin/events/${eventId}/matches/${matchId}`);
  back(locale, eventId, matchId, '#relay');
}

/**
 * 경기 결과·점수 입력. 참가자별 score_<entryId> / result_<entryId> 를 읽어 한 번에 기록한다.
 * recordMatchResult 가 경기를 FINISHED 로 바꾸고 감사기록을 남긴다(순위판·선수기록·자동기사의 원천).
 */
export async function recordResultForm(locale: string, eventId: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const entryIds = String(formData.get('entry_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const results = entryIds.map((entryId) => {
    const scoreRaw = String(formData.get(`score_${entryId}`) ?? '').trim();
    const result = String(formData.get(`result_${entryId}`) ?? '').trim() || null;
    return { entryId: entryId as UUID, score: scoreRaw === '' ? null : Number(scoreRaw), result };
  });
  if (results.length) await recordMatchResult(matchId as UUID, results, { personId: user.personId });
  revalidatePath(`/${locale}/admin/events/${eventId}/matches/${matchId}`);
  revalidatePath(`/${locale}/admin/events/${eventId}`);
  back(locale, eventId, matchId, '#result');
}

export async function deleteRelayForm(locale: string, eventId: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('relay_id') ?? '') as UUID;
  if (id) await deleteRelay(id, user.personId);
  revalidatePath(`/${locale}/admin/events/${eventId}/matches/${matchId}`);
  back(locale, eventId, matchId, '#relay');
}

export async function addVideoForm(locale: string, eventId: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const title = String(formData.get('title') ?? '').trim();
  const provider = String(formData.get('provider') ?? 'YOUTUBE');
  const externalId = String(formData.get('external_id') ?? '').trim() || null;
  const url = String(formData.get('url') ?? '').trim() || null;
  const durationRaw = String(formData.get('duration') ?? '').trim();
  const sportId = String(formData.get('sport_id') ?? '').trim() || null;
  if (title && (externalId || url)) {
    await addVideo(
      {
        matchId: matchId as UUID,
        eventId: eventId as UUID,
        sportId: (sportId as UUID) ?? null,
        titleI18n: { [locale]: title },
        provider,
        externalId,
        url,
        durationSeconds: durationRaw ? Number(durationRaw) : null,
      },
      user.personId
    );
  }
  revalidatePath(`/${locale}/admin/events/${eventId}/matches/${matchId}`);
  back(locale, eventId, matchId, '#video');
}

export async function setVideoStatusForm(locale: string, eventId: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('video_id') ?? '') as UUID;
  const status = String(formData.get('status') ?? '');
  if (id && ['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(status)) await setVideoStatus(id, status, user.personId);
  revalidatePath(`/${locale}/admin/events/${eventId}/matches/${matchId}`);
  back(locale, eventId, matchId, '#video');
}

export async function deleteVideoForm(locale: string, eventId: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('video_id') ?? '') as UUID;
  if (id) await deleteVideo(id, user.personId);
  revalidatePath(`/${locale}/admin/events/${eventId}/matches/${matchId}`);
  back(locale, eventId, matchId, '#video');
}
