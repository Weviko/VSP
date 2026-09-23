'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type UUID } from '@vsp/core-admin';
import {
  assignMatchOfficial, setOfficialStatus, removeMatchOfficial,
  appendMatchEvent, setMatchStatus, finalizeMatch,
  type OfficialRole, type OfficialStatus, type MatchEventKind,
} from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

const ROLES = new Set(['CHIEF_REFEREE', 'REFEREE', 'JUDGE', 'SCORER', 'TIMEKEEPER', 'COMMISSIONER']);
const OSTATUS = new Set(['ASSIGNED', 'CONFIRMED', 'DECLINED', 'REPLACED']);
const KINDS = new Set(['SCORE', 'FOUL', 'SUB', 'PERIOD_START', 'PERIOD_END', 'TIMEOUT', 'CARD', 'NOTE']);

function back(locale: string, matchId: string): never {
  revalidatePath(`/${locale}/admin/competitions/${matchId}`);
  redirect(`/${locale}/admin/competitions/${matchId}`);
}

export async function assignOfficialForm(locale: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const raw = String(formData.get('person_id') ?? '').trim(); // "personId__registrationId"
  const [personId, registrationId] = raw.split('__');
  const roleRaw = String(formData.get('role') ?? 'REFEREE');
  if (personId) {
    await assignMatchOfficial(
      { matchId: matchId as UUID, personId: personId as UUID, role: (ROLES.has(roleRaw) ? roleRaw : 'REFEREE') as OfficialRole,
        registrationId: registrationId ? (registrationId as UUID) : null },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  back(locale, matchId);
}
export async function setOfficialStatusForm(locale: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const officialId = String(formData.get('official_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (officialId && OSTATUS.has(status)) await setOfficialStatus(officialId as UUID, status as OfficialStatus, { personId: user.personId, orgId: user.activeOrgId });
  back(locale, matchId);
}
export async function removeOfficialForm(locale: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const officialId = String(formData.get('official_id') ?? '').trim();
  if (officialId) await removeMatchOfficial(officialId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  back(locale, matchId);
}

export async function appendEventForm(locale: string, matchId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const kind = String(formData.get('kind') ?? '').trim();
  if (!KINDS.has(kind)) back(locale, matchId);
  const pointsRaw = String(formData.get('points') ?? '').trim();
  await appendMatchEvent(
    matchId as UUID,
    {
      kind: kind as MatchEventKind,
      side: String(formData.get('side') ?? '').trim() || null,
      points: pointsRaw && Number.isFinite(Number(pointsRaw)) ? Number(pointsRaw) : (kind === 'SCORE' ? 1 : null),
      period: String(formData.get('period') ?? '').trim() || null,
      note: String(formData.get('note') ?? '').trim() || null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale, matchId);
}

export async function setLiveForm(locale: string, matchId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await setMatchStatus(matchId as UUID, 'LIVE', { personId: user.personId, orgId: user.activeOrgId });
  back(locale, matchId);
}
export async function finalizeMatchForm(locale: string, matchId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await finalizeMatch(matchId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  back(locale, matchId);
}
