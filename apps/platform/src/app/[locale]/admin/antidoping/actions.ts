'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { searchPersons, t as pick, type UUID, type PersonHit } from '@vsp/core-admin';
import {
  recordTest, recordLabResult, decideSanction, liftSanction,
  createEducationCourse, recordEducationCompletion, submitTue, decideTue,
  type TestType, type SampleType, type ABResult, type SanctionType,
} from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

const TTYPES = new Set(['IN_COMPETITION', 'OUT_OF_COMPETITION']);
const STYPES = new Set(['URINE', 'BLOOD']);
const RESULTS = new Set(['NEG', 'POS']);
const SANCTIONS = new Set(['SUSPENSION', 'WARNING', 'DQ']);

function back(locale: string): never {
  revalidatePath(`/${locale}/admin/antidoping`);
  redirect(`/${locale}/admin/antidoping`);
}
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

export async function recordTestForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  if (!personId) back(locale);
  const sportId = String(formData.get('sport_id') ?? '').trim();
  const tt = String(formData.get('test_type') ?? 'OUT_OF_COMPETITION');
  const st = String(formData.get('sample_type') ?? 'URINE');
  await recordTest(
    {
      personId: personId as UUID,
      sportId: sportId ? (sportId as UUID) : null,
      testType: (TTYPES.has(tt) ? tt : 'OUT_OF_COMPETITION') as TestType,
      sampleType: (STYPES.has(st) ? st : 'URINE') as SampleType,
      sampleCode: String(formData.get('sample_code') ?? '').trim() || null,
      collectorOrgId: user.activeOrgId ?? null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale);
}

export async function labResultForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const testId = String(formData.get('test_id') ?? '').trim();
  const a = String(formData.get('a_result') ?? '').trim();
  const b = String(formData.get('b_result') ?? '').trim();
  if (testId) {
    await recordLabResult(
      testId as UUID,
      { aResult: RESULTS.has(a) ? (a as ABResult) : null, bResult: RESULTS.has(b) ? (b as ABResult) : null },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  back(locale);
}

export async function decideSanctionForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  if (!personId) back(locale);
  const stype = String(formData.get('sanction_type') ?? 'SUSPENSION');
  const sportId = String(formData.get('sport_id') ?? '').trim();
  const testId = String(formData.get('test_id') ?? '').trim();
  await decideSanction(
    {
      personId: personId as UUID,
      testId: testId ? (testId as UUID) : null,
      sanctionType: (SANCTIONS.has(stype) ? stype : 'SUSPENSION') as SanctionType,
      adrvArticle: String(formData.get('adrv_article') ?? '').trim() || null,
      startsOn: String(formData.get('starts_on') ?? '').trim() || null,
      endsOn: String(formData.get('ends_on') ?? '').trim() || null,
      decisionNo: String(formData.get('decision_no') ?? '').trim() || null,
      isPublic: String(formData.get('is_public') ?? '') === 'on',
      sportId: sportId ? (sportId as UUID) : null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale);
}

export async function liftSanctionForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const sanctionId = String(formData.get('sanction_id') ?? '').trim();
  if (sanctionId) await liftSanction(sanctionId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  back(locale);
}

export async function createCourseForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const nameI18n = i18nOf(formData, 'name');
  if (!nameI18n) back(locale);
  const vm = Number(String(formData.get('validity_months') ?? '12').trim());
  await createEducationCourse(
    {
      code: String(formData.get('code') ?? '').trim() || null,
      nameI18n: nameI18n!,
      validityMonths: Number.isFinite(vm) && vm > 0 ? vm : 12,
      isMandatory: String(formData.get('is_mandatory') ?? '') === 'on',
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale);
}

export async function recordCompletionForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const courseId = String(formData.get('course_id') ?? '').trim();
  const personId = String(formData.get('person_id') ?? '').trim();
  const sportId = String(formData.get('sport_id') ?? '').trim();
  const scoreRaw = String(formData.get('score') ?? '').trim();
  if (courseId && personId) {
    await recordEducationCompletion(
      {
        courseId: courseId as UUID,
        personId: personId as UUID,
        sportId: sportId ? (sportId as UUID) : null,
        score: scoreRaw ? Number(scoreRaw) : null,
      },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  back(locale);
}

export async function submitTueForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  const substance = String(formData.get('substance') ?? '').trim();
  const sportId = String(formData.get('sport_id') ?? '').trim();
  if (personId && substance) {
    await submitTue(
      {
        personId: personId as UUID,
        sportId: sportId ? (sportId as UUID) : null,
        substance,
        reason: String(formData.get('reason') ?? '').trim() || null,
        validFrom: String(formData.get('valid_from') ?? '').trim() || null,
        validTo: String(formData.get('valid_to') ?? '').trim() || null,
      },
      { personId: user.personId, orgId: user.activeOrgId }
    );
  }
  back(locale);
}
export async function decideTueForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const tueId = String(formData.get('tue_id') ?? '').trim();
  const decision = String(formData.get('decision') ?? '').trim();
  if (tueId && (decision === 'APPROVED' || decision === 'REJECTED')) {
    await decideTue(tueId as UUID, decision, { personId: user.personId, orgId: user.activeOrgId });
  }
  back(locale);
}
