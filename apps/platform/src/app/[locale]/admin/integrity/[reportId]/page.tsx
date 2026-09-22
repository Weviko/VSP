import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getReport, t as pick, type MeasureType, type ReportActionType } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import {
  screenReportForm, assignReportForm, addNoteForm, decideReportForm, recordMeasureForm, closeReportForm,
  searchPersonsAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'red' | 'green' | 'neutral'> = {
  RECEIVED: 'amber', SCREENING: 'amber', INVESTIGATING: 'blue', DECIDED: 'blue', CLOSED: 'green', DISMISSED: 'neutral',
};
const MEASURES: MeasureType[] = ['WARNING', 'SUSPENSION', 'BAN', 'EDU_ORDER', 'REFERRAL'];
const NOTE_ACTIONS: ReportActionType[] = ['NOTE', 'REQUEST_INFO', 'INTERVIEW'];
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function IntegrityDetailPage({ params }: { params: Promise<{ locale: string; reportId: string }> }) {
  const { locale: raw, reportId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const data = await getReport(reportId).catch(() => null);
  if (!data) notFound();
  const { report, parties, actions, measures } = data;
  const terminal = report.status === 'CLOSED' || report.status === 'DISMISSED';
  const pickerLabels = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const base = `/${locale}/admin/integrity`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="text-sm text-[#15607A] hover:underline">← {t('integrity.queueTitle')}</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={report.title} />
        <Badge tone={STATUS_TONE[report.status] ?? 'neutral'}>{t(`integrity.st.${report.status}`)}</Badge>
        {report.is_minor_involved ? (
          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">{t('integrity.minorInvolved')}</span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 좌: 사건 정보 */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-slate-500">{t('integrity.caseNo')}</dt><dd className="font-mono font-semibold text-slate-900">{report.case_no}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.category')}</dt><dd className="text-slate-800">{t(`integrity.cat.${report.category}`)}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.severity')}</dt><dd className="text-slate-800">{report.severity ? t(`integrity.sev.${report.severity}`) : '—'}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.sport')}</dt><dd className="text-slate-800">{report.sport_name ? pick(report.sport_name, locale) : '—'}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.respondent')}</dt><dd className="text-slate-800 wrap-anywhere">{report.respondent_org_name ? pick(report.respondent_org_name, locale) : (report.respondent_name ?? '—')}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.assignee')}</dt><dd className="text-slate-800">{report.assigned_name ?? t('integrity.unassigned')}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.reporter')}</dt><dd className="text-slate-800">{report.is_anonymous ? t('integrity.anonymous') : (report.reporter_contact ?? '—')}</dd></div>
              <div><dt className="text-slate-500">{t('integrity.received')}</dt><dd className="tabular-nums text-slate-800">{report.received_at?.slice(0, 16).replace('T', ' ')}</dd></div>
            </dl>
            {report.detail ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-1 text-xs text-slate-500">{t('integrity.detail')}</p>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{report.detail}</p>
              </div>
            ) : null}
          </Card>

          {/* 관계인 */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('integrity.parties')}</h2>
            {parties.length === 0 ? (
              <EmptyState message={t('common.noData')} />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
                {parties.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="text-slate-800 wrap-anywhere">
                      {p.person_name ?? (p.org_name ? pick(p.org_name, locale) : p.name_text ?? '—')}
                      {p.is_minor ? <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700">{t('integrity.minorInvolved')}</span> : null}
                    </span>
                    <Badge tone="neutral">{t(`integrity.role.${p.party_role}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 조치 */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('integrity.measures')}</h2>
            {measures.length === 0 ? (
              <EmptyState message={t('common.noData')} />
            ) : (
              <Table head={[t('integrity.category'), t('integrity.target'), t('integrity.decisionNo'), t('integrity.startsOn'), t('integrity.reflected')]}>
                {measures.map((m) => (
                  <Tr key={m.id}>
                    <Td><Badge tone={m.measure_type === 'BAN' || m.measure_type === 'SUSPENSION' ? 'red' : 'amber'}>{t(`integrity.mt.${m.measure_type}`)}</Badge></Td>
                    <Td className="text-slate-700 wrap-anywhere">{m.target_name ?? '—'}</Td>
                    <Td className="text-slate-600">{m.decision_no ?? '—'}</Td>
                    <Td className="tabular-nums text-slate-500">{m.starts_on ?? '—'}</Td>
                    <Td>{m.reflected_to_registration ? <Badge tone="green">✓</Badge> : '—'}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </section>

          {/* 처리 이력 */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('integrity.timeline')}</h2>
            <ol className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
              <li className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#15607A]" />
                <span className="font-medium text-slate-700">{t('integrity.st.RECEIVED')}</span>
                <span className="ml-2 tabular-nums text-xs text-slate-400">{report.received_at?.slice(0, 16).replace('T', ' ')}</span>
              </li>
              {actions.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="font-medium text-slate-700">{t(`integrity.act.${a.action}`)}</span>
                  {a.actor_name ? <span className="ml-2 text-xs text-slate-500">· {a.actor_name}</span> : null}
                  <span className="ml-2 tabular-nums text-xs text-slate-400">{a.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  {a.note ? <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{a.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* 우: 처리 도구 */}
        {terminal ? null : (
          <div className="space-y-4">
            {/* 선별 (접수/선별 단계) */}
            {(report.status === 'RECEIVED' || report.status === 'SCREENING') ? (
              <Card>
                <form action={screenReportForm.bind(null, locale, report.id)} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{t('integrity.toolScreen')}</p>
                  <select name="decision" defaultValue="accept" className={input}>
                    <option value="accept">{t('integrity.toolScreen')}</option>
                    <option value="dismiss">{t('integrity.toolDismiss')}</option>
                  </select>
                  <select name="severity" defaultValue="" className={input}>
                    <option value="">{t('integrity.severity')}</option>
                    <option value="LOW">{t('integrity.sev.LOW')}</option>
                    <option value="MED">{t('integrity.sev.MED')}</option>
                    <option value="HIGH">{t('integrity.sev.HIGH')}</option>
                  </select>
                  <input name="reason" placeholder={t('integrity.reason')} className={input} />
                  <button className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
                </form>
              </Card>
            ) : null}

            {/* 조사자 배정 */}
            <Card>
              <form action={assignReportForm.bind(null, locale, report.id)} className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t('integrity.toolAssign')}</p>
                <PersonPicker name="person_id" onSearch={searchPersonsAction.bind(null, locale)} labels={pickerLabels} />
                <button className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
              </form>
            </Card>

            {/* 사건일지 */}
            <Card>
              <form action={addNoteForm.bind(null, locale, report.id)} className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t('integrity.toolNote')}</p>
                <select name="action" defaultValue="NOTE" className={input}>
                  {NOTE_ACTIONS.map((a) => <option key={a} value={a}>{t(`integrity.act.${a}`)}</option>)}
                </select>
                <textarea name="note" rows={2} placeholder={t('integrity.note')} className={input} />
                <button className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">{t('common.save')}</button>
              </form>
            </Card>

            {/* 결정 */}
            {report.status === 'INVESTIGATING' || report.status === 'SCREENING' ? (
              <Card>
                <form action={decideReportForm.bind(null, locale, report.id)} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{t('integrity.toolDecide')}</p>
                  <textarea name="summary" rows={2} placeholder={t('integrity.summary')} className={input} />
                  <button className="w-full rounded bg-[#15607A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0e4356]">{t('common.save')}</button>
                </form>
              </Card>
            ) : null}

            {/* 조치·징계 */}
            {report.status === 'DECIDED' || report.status === 'INVESTIGATING' ? (
              <Card>
                <form action={recordMeasureForm.bind(null, locale, report.id)} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{t('integrity.toolMeasure')}</p>
                  <select name="measure_type" defaultValue="WARNING" className={input}>
                    {MEASURES.map((m) => <option key={m} value={m}>{t(`integrity.mt.${m}`)}</option>)}
                  </select>
                  <div>
                    <span className="mb-1 block text-xs text-slate-500">{t('integrity.target')}</span>
                    <PersonPicker name="target_person_id" onSearch={searchPersonsAction.bind(null, locale)} labels={pickerLabels} />
                  </div>
                  <input name="decision_no" placeholder={t('integrity.decisionNo')} className={input} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" name="starts_on" className={input} />
                    <input type="date" name="ends_on" className={input} />
                  </div>
                  <button className="w-full rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-800">{t('common.save')}</button>
                </form>
              </Card>
            ) : null}

            {/* 종결 */}
            {report.status === 'DECIDED' ? (
              <Card>
                <form action={closeReportForm.bind(null, locale, report.id)} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{t('integrity.toolClose')}</p>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="publish" /> {t('integrity.publishPublic')}
                  </label>
                  <textarea name="summary_vi" rows={2} placeholder={`${t('integrity.publicSummary')} (VI)`} className={input} />
                  <textarea name="summary_en" rows={2} placeholder={`${t('integrity.publicSummary')} (EN)`} className={input} />
                  <textarea name="summary_ko" rows={2} placeholder={`${t('integrity.publicSummary')} (KO)`} className={input} />
                  <button className="w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">{t('common.save')}</button>
                </form>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
