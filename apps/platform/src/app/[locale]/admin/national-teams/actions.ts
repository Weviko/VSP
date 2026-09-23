'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { searchPersons, searchOrgs, t as pick, type UUID, type PersonHit } from '@vsp/core-admin';
import {
  createNationalTeam, createCallup, approveCallup, nominateMember, setMemberStatus,
  recordEvaluation, finalizeSquad, QuotaExceededError,
  type Gender, type AgeClass, type CallupType, type SquadRole, type MemberStatus,
} from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

const GENDERS = new Set(['M', 'F', 'MIXED']);
const AGES = new Set(['SENIOR', 'U23', 'U20', 'YOUTH']);
const CTYPES = new Set(['SELECTION', 'CAMP', 'COMPETITION_ENTRY']);
const ROLES = new Set(['ATHLETE', 'COACH', 'MANAGER', 'MEDICAL', 'RESERVE']);
const MSTATUS = new Set(['NOMINATED', 'SELECTED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN', 'REPLACED']);

function i18nOf(fd: FormData, base: string) {
  const vi = String(fd.get(`${base}_vi`) ?? '').trim();
  const en = String(fd.get(`${base}_en`) ?? '').trim();
  const ko = String(fd.get(`${base}_ko`) ?? '').trim();
  if (!vi && !en && !ko) return null;
  return { vi: vi || en || ko, en: en || undefined, ko: ko || undefined };
}

export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}
export async function searchOrgsAction(locale: string, q: string): Promise<Array<{ id: string; label: string; sub?: string }>> {
  await requireWorkspace(locale);
  const hits = await searchOrgs(q, { limit: 10 });
  return hits.map((o) => ({ id: o.id, label: pick(o.name_i18n, locale as 'vi' | 'en' | 'ko'), sub: o.display_id ?? o.region_code ?? undefined }));
}

export async function createNationalTeamForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const sportId = String(formData.get('sport_id') ?? '').trim();
  const nameI18n = i18nOf(formData, 'name');
  if (!sportId || !nameI18n) redirect(`/${locale}/admin/national-teams?err=1`);
  const genderRaw = String(formData.get('gender') ?? 'MIXED');
  const ageRaw = String(formData.get('age_class') ?? 'SENIOR');
  const orgId = String(formData.get('governing_org_id') ?? '').trim();
  const coachId = String(formData.get('head_coach_person_id') ?? '').trim();
  const id = await createNationalTeam(
    {
      sportId: sportId as UUID,
      nameI18n: nameI18n!,
      gender: (GENDERS.has(genderRaw) ? genderRaw : 'MIXED') as Gender,
      ageClass: (AGES.has(ageRaw) ? ageRaw : 'SENIOR') as AgeClass,
      governingOrgId: orgId ? (orgId as UUID) : null,
      headCoachPersonId: coachId ? (coachId as UUID) : null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  redirect(`/${locale}/admin/national-teams/${id}`);
}

export async function createCallupForm(locale: string, teamId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const seasonId = String(formData.get('season_id') ?? '').trim();
  if (!seasonId) redirect(`/${locale}/admin/national-teams/${teamId}?err=1`);
  const ctypeRaw = String(formData.get('callup_type') ?? 'SELECTION');
  const quotaRaw = String(formData.get('quota') ?? '').trim();
  const id = await createCallup(
    {
      nationalTeamId: teamId as UUID,
      seasonId: seasonId as UUID,
      callupType: (CTYPES.has(ctypeRaw) ? ctypeRaw : 'SELECTION') as CallupType,
      targetCompetitionNameI18n: i18nOf(formData, 'competition'),
      quota: quotaRaw && Number.isFinite(Number(quotaRaw)) ? Number(quotaRaw) : null,
      venueText: String(formData.get('venue_text') ?? '').trim() || null,
      startsOn: String(formData.get('starts_on') ?? '').trim() || null,
      endsOn: String(formData.get('ends_on') ?? '').trim() || null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  redirect(`/${locale}/admin/national-teams/callups/${id}`);
}

function backCallup(locale: string, callupId: string): never {
  revalidatePath(`/${locale}/admin/national-teams/callups/${callupId}`);
  redirect(`/${locale}/admin/national-teams/callups/${callupId}`);
}

export async function approveCallupForm(locale: string, callupId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  await approveCallup(callupId as UUID, String(formData.get('decision_no') ?? '').trim() || null, { personId: user.personId, orgId: user.activeOrgId });
  backCallup(locale, callupId);
}

export async function nominateMemberForm(locale: string, callupId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  const roleRaw = String(formData.get('squad_role') ?? 'ATHLETE');
  if (personId) {
    await nominateMember(
      { callupId: callupId as UUID, personId: personId as UUID, squadRole: (ROLES.has(roleRaw) ? roleRaw : 'ATHLETE') as SquadRole },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  backCallup(locale, callupId);
}

export async function setMemberStatusForm(locale: string, callupId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const memberId = String(formData.get('member_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (memberId && MSTATUS.has(status)) await setMemberStatus(memberId as UUID, status as MemberStatus, { personId: user.personId, orgId: user.activeOrgId });
  backCallup(locale, callupId);
}

export async function recordEvaluationForm(locale: string, callupId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const memberId = String(formData.get('member_id') ?? '').trim();
  const scoreRaw = String(formData.get('score') ?? '').trim();
  const rankRaw = String(formData.get('rank_no') ?? '').trim();
  if (memberId) {
    await recordEvaluation(
      memberId as UUID,
      { score: scoreRaw ? Number(scoreRaw) : null, rankNo: rankRaw ? Number(rankRaw) : null },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  backCallup(locale, callupId);
}

export async function finalizeSquadForm(locale: string, callupId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  try {
    await finalizeSquad(callupId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      revalidatePath(`/${locale}/admin/national-teams/callups/${callupId}`);
      redirect(`/${locale}/admin/national-teams/callups/${callupId}?err=quota`);
    }
    throw e;
  }
  backCallup(locale, callupId);
}
