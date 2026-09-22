'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  screenReport, assignReport, addReportAction, decideReport, recordMeasure, closeReport,
  searchPersons,
  type UUID, type PersonHit, type Severity, type MeasureType, type ReportActionType, type I18nText,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

const SEVERITIES = new Set(['LOW', 'MED', 'HIGH']);
const MEASURES = new Set(['WARNING', 'SUSPENSION', 'BAN', 'EDU_ORDER', 'REFERRAL']);
const NOTE_ACTIONS = new Set(['REQUEST_INFO', 'INTERVIEW', 'NOTE']);

function back(locale: string, reportId: string): never {
  revalidatePath(`/${locale}/admin/integrity/${reportId}`);
  redirect(`/${locale}/admin/integrity/${reportId}`);
}

export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}

export async function screenReportForm(locale: string, reportId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const dismiss = String(formData.get('decision') ?? '') === 'dismiss';
  const sevRaw = String(formData.get('severity') ?? '').trim();
  const severity = SEVERITIES.has(sevRaw) ? (sevRaw as Severity) : null;
  await screenReport(
    reportId as UUID,
    { severity, dismiss, reason: String(formData.get('reason') ?? '').trim() || null },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale, reportId);
}

export async function assignReportForm(locale: string, reportId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  await assignReport(
    reportId as UUID,
    { orgId: user.activeOrgId ?? null, personId: personId ? (personId as UUID) : null },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale, reportId);
}

export async function addNoteForm(locale: string, reportId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const actRaw = String(formData.get('action') ?? '').trim();
  const action = (NOTE_ACTIONS.has(actRaw) ? actRaw : 'NOTE') as ReportActionType;
  const note = String(formData.get('note') ?? '').trim();
  if (note) {
    await addReportAction(reportId as UUID, { action, note }, { personId: user.personId, orgId: user.activeOrgId });
  }
  back(locale, reportId);
}

export async function decideReportForm(locale: string, reportId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  await decideReport(
    reportId as UUID,
    { summary: String(formData.get('summary') ?? '').trim() || null },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale, reportId);
}

export async function recordMeasureForm(locale: string, reportId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const typeRaw = String(formData.get('measure_type') ?? '').trim();
  if (!MEASURES.has(typeRaw)) back(locale, reportId);
  const personId = String(formData.get('target_person_id') ?? '').trim();
  await recordMeasure(
    reportId as UUID,
    {
      measureType: typeRaw as MeasureType,
      targetPersonId: personId ? (personId as UUID) : null,
      decisionNo: String(formData.get('decision_no') ?? '').trim() || null,
      startsOn: String(formData.get('starts_on') ?? '').trim() || null,
      endsOn: String(formData.get('ends_on') ?? '').trim() || null,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale, reportId);
}

export async function closeReportForm(locale: string, reportId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const publish = String(formData.get('publish') ?? '') === 'on';
  const sumVi = String(formData.get('summary_vi') ?? '').trim();
  const sumEn = String(formData.get('summary_en') ?? '').trim();
  const sumKo = String(formData.get('summary_ko') ?? '').trim();
  const publicSummaryI18n: I18nText | null =
    publish && (sumVi || sumEn || sumKo)
      ? { vi: sumVi || sumEn || sumKo, en: sumEn || undefined, ko: sumKo || undefined }
      : null;
  await closeReport(
    reportId as UUID,
    { publish, publicSummaryI18n },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  back(locale, reportId);
}
