'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { searchPersons, type UUID, type PersonHit } from '@vsp/core-admin';
import {
  upsertGrade, createCourse, setCourseStatus, enrollCourse, markCompletion,
  grantCredential, renewCredential, setCoachCredentialStatus, RefresherHoursError,
  type CourseType, type CourseStatus, type EnrollmentStatus, type CoachCredentialStatus,
} from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

const CTYPES = new Set(['QUALIFICATION', 'REFRESHER']);
const CSTATUS = new Set(['DRAFT', 'OPEN', 'CLOSED', 'FINISHED']);
const ESTATUS = new Set(['ENROLLED', 'COMPLETED', 'FAILED', 'CANCELLED']);
const CREDSTATUS = new Set(['VALID', 'SUSPENDED', 'REVOKED']);

function i18nOf(fd: FormData, base: string) {
  const vi = String(fd.get(`${base}_vi`) ?? '').trim();
  const en = String(fd.get(`${base}_en`) ?? '').trim();
  const ko = String(fd.get(`${base}_ko`) ?? '').trim();
  if (!vi && !en && !ko) return null;
  return { vi: vi || en || ko, en: en || undefined, ko: ko || undefined };
}
function home(locale: string): never {
  revalidatePath(`/${locale}/admin/coaching`);
  redirect(`/${locale}/admin/coaching`);
}
function courseBack(locale: string, courseId: string): never {
  revalidatePath(`/${locale}/admin/coaching/courses/${courseId}`);
  redirect(`/${locale}/admin/coaching/courses/${courseId}`);
}
const num = (fd: FormData, k: string): number | null => {
  const v = String(fd.get(k) ?? '').trim();
  return v && Number.isFinite(Number(v)) ? Number(v) : null;
};

export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}

export async function upsertGradeForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const code = String(formData.get('code') ?? '').trim();
  const nameI18n = i18nOf(formData, 'name');
  const sportId = String(formData.get('sport_id') ?? '').trim();
  if (!code || !nameI18n) home(locale);
  await upsertGrade(
    { code, nameI18n: nameI18n!, sportId: sportId ? (sportId as UUID) : null,
      levelOrder: num(formData, 'level_order') ?? 1, validityYears: num(formData, 'validity_years') ?? 4,
      refresherHoursRequired: num(formData, 'refresher_hours_required') ?? 0 },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  home(locale);
}

export async function createCourseForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const nameI18n = i18nOf(formData, 'cname');
  if (!nameI18n) home(locale);
  const gradeId = String(formData.get('grade_id') ?? '').trim();
  const ct = String(formData.get('course_type') ?? 'REFRESHER');
  await createCourse(
    { nameI18n: nameI18n!, gradeId: gradeId ? (gradeId as UUID) : null,
      courseType: (CTYPES.has(ct) ? ct : 'REFRESHER') as CourseType, hours: num(formData, 'hours') ?? 0,
      capacity: num(formData, 'capacity'), startsOn: String(formData.get('starts_on') ?? '').trim() || null,
      endsOn: String(formData.get('ends_on') ?? '').trim() || null },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  home(locale);
}
export async function setCourseStatusForm(locale: string, courseId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const status = String(formData.get('status') ?? '').trim();
  if (CSTATUS.has(status)) await setCourseStatus(courseId as UUID, status as CourseStatus, { personId: user.personId, orgId: user.activeOrgId });
  courseBack(locale, courseId);
}
export async function enrollCourseForm(locale: string, courseId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  if (personId) await enrollCourse(courseId as UUID, personId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  courseBack(locale, courseId);
}
export async function markCompletionForm(locale: string, courseId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const enrollmentId = String(formData.get('enrollment_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (enrollmentId && ESTATUS.has(status)) {
    await markCompletion(
      enrollmentId as UUID,
      { status: status as EnrollmentStatus, hoursEarned: num(formData, 'hours_earned'), score: num(formData, 'score') },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  courseBack(locale, courseId);
}

export async function grantCredentialForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  const gradeId = String(formData.get('grade_id') ?? '').trim();
  const sportId = String(formData.get('sport_id') ?? '').trim();
  if (!personId || !gradeId) home(locale);
  await grantCredential(
    { personId: personId as UUID, gradeId: gradeId as UUID, sportId: sportId ? (sportId as UUID) : null,
      obtainedOn: String(formData.get('obtained_on') ?? '').trim() || null },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  home(locale);
}
export async function renewCredentialForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const credentialId = String(formData.get('credential_id') ?? '').trim();
  if (credentialId) {
    try {
      await renewCredential(credentialId as UUID, { personId: user.personId, orgId: user.activeOrgId });
    } catch (e) {
      if (e instanceof RefresherHoursError) {
        revalidatePath(`/${locale}/admin/coaching`);
        redirect(`/${locale}/admin/coaching?err=refresher&earn=${e.earned}&req=${e.required}`);
      }
      throw e;
    }
  }
  home(locale);
}
export async function setCoachCredentialStatusForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const credentialId = String(formData.get('credential_id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (credentialId && CREDSTATUS.has(status)) {
    await setCoachCredentialStatus(credentialId as UUID, status as CoachCredentialStatus, { personId: user.personId, orgId: user.activeOrgId });
  }
  home(locale);
}
