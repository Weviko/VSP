'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createEvent, updateEvent, approveEvent, generateDraw, addEntry, recordMatchResult,
  UnsupportedFormatError, type MatchFormat,
} from '@vsp/sport-domain';
import { getForm, submitForm, startWorkflow, queryOne, type UUID } from '@vsp/core-admin';
import { workUserOrNull, requireWorkspace } from '@/lib/session';

/** 대회 정보 수정. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다. */
export async function updateEventForm(locale: string, eventId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const nameVi = String(formData.get('name_vi') ?? '').trim();
  if (nameVi) {
    await updateEvent(
      eventId as UUID,
      {
        nameI18n: {
          vi: nameVi,
          en: String(formData.get('name_en') ?? '').trim() || undefined,
          ko: String(formData.get('name_ko') ?? '').trim() || undefined,
        },
        eventLevel: String(formData.get('event_level') ?? '').trim() || null,
        eventType: String(formData.get('event_type') ?? '').trim() || null,
        startsOn: String(formData.get('starts_on') ?? '').trim() || undefined,
        endsOn: String(formData.get('ends_on') ?? '').trim() || undefined,
        venueText: String(formData.get('venue_text') ?? '').trim() || null,
        entryClosesAt: String(formData.get('entry_closes_at') ?? '').trim() || null,
      },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  revalidatePath(`/${locale}/admin/events/${eventId}`);
  redirect(`/${locale}/admin/events/${eventId}`);
}

/**
 * 대회 개최 신청.
 * 베트남 체육법상 서류 접수 후 10일 이내 결정이므로, 신청과 동시에 결재를 시작해
 * 법정 기한 카운트다운이 돌아가게 한다.
 */
export async function createEventAction(input: {
  nameVi: string;
  nameKo?: string;
  sportId: string | null;
  hostOrgId: string;
  eventLevel: string;
  startsOn: string;
  endsOn: string;
  venueText?: string;
  entryClosesAt?: string;
  locale: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const season = await queryOne<{ id: UUID }>(
      `SELECT id FROM core.season WHERE is_current LIMIT 1`
    );
    if (!season) return { ok: false, error: 'NO_CURRENT_SEASON' };

    // 개최 신청서를 먼저 만들고 결재를 건다 (승인 전에는 비공개)
    let submissionId: string | null = null;
    const form = await getForm('EVENT_APPLY');
    if (form) {
      const sub = await submitForm({
        formId: form.id,
        subjectType: 'EVENT',
        submitterPersonId: user?.personId ?? null,
        submitterOrgId: input.hostOrgId,
        data: {
          name: input.nameVi,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          venue: input.venueText ?? '',
          level: input.eventLevel,
        },
      });
      submissionId = sub.id;
      await startWorkflow(sub.id, form.code, input.hostOrgId);
    }

    const ev = await createEvent(
      {
        nameI18n: { vi: input.nameVi, ...(input.nameKo ? { ko: input.nameKo } : {}) },
        sportId: input.sportId,
        seasonId: season.id,
        hostOrgId: input.hostOrgId,
        eventLevel: input.eventLevel,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        venueText: input.venueText ?? null,
        entryClosesAt: input.entryClosesAt || null,
        approvalSubmissionId: submissionId,
      },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );

    revalidatePath(`/${input.locale}/admin/events`);
    return { ok: true, id: ev.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveEventAction(
  eventId: string,
  decisionNo: string,
  locale: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await approveEvent(eventId, decisionNo || null, {
      personId: user?.personId,
      orgId: user?.activeOrgId,
    });
    revalidatePath(`/${locale}/admin/events/${eventId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function generateDrawAction(
  eventId: string,
  format: MatchFormat,
  locale: string
): Promise<{ ok: boolean; created?: number; notes?: string[]; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const res = await generateDraw(eventId, format);
    revalidatePath(`/${locale}/admin/events/${eventId}`);
    return { ok: true, created: res.created, notes: res.notes };
  } catch (e) {
    if (e instanceof UnsupportedFormatError)
      return { ok: false, error: `FORMAT_NOT_IMPLEMENTED:${e.format}` };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addEntryAction(input: {
  eventId: string;
  personName: string;
  orgId?: string | null;
  seedNo?: number | null;
  locale: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    // 데모 단계에서는 이름으로 인물을 찾거나 만든다.
    // 실제로는 등록된 선수 목록에서 선택하게 되고 자격 검증이 함께 돈다.
    let person = await queryOne<{ id: UUID }>(
      `SELECT id FROM core.person WHERE full_name = $1 AND deleted_at IS NULL LIMIT 1`,
      [input.personName]
    );
    if (!person) {
      person = await queryOne<{ id: UUID }>(
        `INSERT INTO core.person (full_name) VALUES ($1) RETURNING id`,
        [input.personName]
      );
    }

    await addEntry({
      eventId: input.eventId,
      personId: person!.id,
      submittedOrgId: input.orgId ?? null,
      seedNo: input.seedNo ?? null,
    });

    revalidatePath(`/${input.locale}/admin/events/${input.eventId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function recordResultAction(input: {
  matchId: string;
  eventId: string;
  results: Array<{ entryId: string; score: number | null; result: string | null }>;
  locale: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await recordMatchResult(input.matchId, input.results, { personId: user?.personId });
    revalidatePath(`/${input.locale}/admin/events/${input.eventId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
