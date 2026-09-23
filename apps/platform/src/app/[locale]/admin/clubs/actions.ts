'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { searchPersons, t as pick, type UUID, type PersonHit } from '@vsp/core-admin';
import {
  createClub, approveClub, rejectClub, addClubMember, endClubMembership,
  createClubProgram, setClubProgramStatus, enrollMember, cancelEnrollment, ProgramFullError,
  type ClubType, type MemberRole, type ProgramCategory, type ProgramStatus,
} from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

const CTYPES = new Set(['COMMUNITY', 'PUBLIC', 'DESIGNATED']);
const ROLES = new Set(['MEMBER', 'LEADER', 'INSTRUCTOR']);
const PCATS = new Set(['YOUTH', 'ADULT', 'SENIOR', 'PARA', 'ALL']);
const PSTATUS = new Set(['DRAFT', 'OPEN', 'CLOSED', 'FINISHED']);

function i18nOf(fd: FormData, base: string) {
  const vi = String(fd.get(`${base}_vi`) ?? '').trim();
  const en = String(fd.get(`${base}_en`) ?? '').trim();
  const ko = String(fd.get(`${base}_ko`) ?? '').trim();
  if (!vi && !en && !ko) return null;
  return { vi: vi || en || ko, en: en || undefined, ko: ko || undefined };
}
function backClub(locale: string, clubId: string): never {
  revalidatePath(`/${locale}/admin/clubs/${clubId}`);
  redirect(`/${locale}/admin/clubs/${clubId}`);
}

export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}

export async function createClubForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const sportId = String(formData.get('sport_id') ?? '').trim();
  const nameI18n = i18nOf(formData, 'name');
  if (!sportId || !nameI18n) redirect(`/${locale}/admin/clubs?err=1`);
  const ctypeRaw = String(formData.get('club_type') ?? 'COMMUNITY');
  const rep = String(formData.get('representative_person_id') ?? '').trim();
  const cap = String(formData.get('member_capacity') ?? '').trim();
  const id = await createClub(
    {
      sportId: sportId as UUID,
      nameI18n: nameI18n!,
      shortName: String(formData.get('short_name') ?? '').trim() || null,
      regionCode: String(formData.get('region_code') ?? '').trim() || null,
      clubType: (CTYPES.has(ctypeRaw) ? ctypeRaw : 'COMMUNITY') as ClubType,
      venueText: String(formData.get('venue_text') ?? '').trim() || null,
      representativePersonId: rep ? (rep as UUID) : null,
      orgId: user.activeOrgId ?? null,
      memberCapacity: cap && Number.isFinite(Number(cap)) ? Number(cap) : null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  redirect(`/${locale}/admin/clubs/${id}`);
}

export async function approveClubForm(locale: string, clubId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await approveClub(clubId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  backClub(locale, clubId);
}
export async function rejectClubForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  await rejectClub(clubId as UUID, { personId: user.personId, orgId: user.activeOrgId }, String(formData.get('reason') ?? '').trim() || null);
  backClub(locale, clubId);
}

export async function addMemberForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  const roleRaw = String(formData.get('role') ?? 'MEMBER');
  if (personId) {
    await addClubMember(
      { clubId: clubId as UUID, personId: personId as UUID, role: (ROLES.has(roleRaw) ? roleRaw : 'MEMBER') as MemberRole,
        memberNo: String(formData.get('member_no') ?? '').trim() || null },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  backClub(locale, clubId);
}
export async function endMemberForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const memberId = String(formData.get('member_id') ?? '').trim();
  if (memberId) await endClubMembership(memberId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  backClub(locale, clubId);
}

export async function createProgramForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const nameI18n = i18nOf(formData, 'pname');
  if (!nameI18n) backClub(locale, clubId);
  const catRaw = String(formData.get('category') ?? 'ALL');
  const cap = String(formData.get('capacity') ?? '').trim();
  await createClubProgram(
    {
      clubId: clubId as UUID,
      nameI18n: nameI18n!,
      category: (PCATS.has(catRaw) ? catRaw : 'ALL') as ProgramCategory,
      scheduleText: String(formData.get('schedule_text') ?? '').trim() || null,
      capacity: cap && Number.isFinite(Number(cap)) ? Number(cap) : null,
      startsOn: String(formData.get('starts_on') ?? '').trim() || null,
      endsOn: String(formData.get('ends_on') ?? '').trim() || null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  backClub(locale, clubId);
}
export async function setProgramStatusForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const programId = String(formData.get('program_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (programId && PSTATUS.has(status)) await setClubProgramStatus(programId as UUID, status as ProgramStatus, { personId: user.personId, orgId: user.activeOrgId });
  backClub(locale, clubId);
}

export async function enrollForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const programId = String(formData.get('program_id') ?? '').trim();
  const clubMemberId = String(formData.get('club_member_id') ?? '').trim();
  if (programId && clubMemberId) {
    try {
      await enrollMember({ programId: programId as UUID, clubMemberId: clubMemberId as UUID }, { personId: user.personId, orgId: user.activeOrgId });
    } catch (e) {
      if (e instanceof ProgramFullError) { revalidatePath(`/${locale}/admin/clubs/${clubId}`); redirect(`/${locale}/admin/clubs/${clubId}?err=full`); }
      throw e;
    }
  }
  backClub(locale, clubId);
}
export async function cancelEnrollForm(locale: string, clubId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const enrollmentId = String(formData.get('enrollment_id') ?? '').trim();
  if (enrollmentId) await cancelEnrollment(enrollmentId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  backClub(locale, clubId);
}
