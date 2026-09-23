import { t as pick } from '@vsp/core-admin';
import {
  getAntidopingOverview, listTests, listSanctions, listEducationCourses, listTue, listSports,
  type TestType, type SampleType, type SanctionType,
} from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, StatCard, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import {
  recordTestForm, labResultForm, decideSanctionForm, liftSanctionForm,
  createCourseForm, recordCompletionForm, submitTueForm, decideTueForm, searchPersonsAction,
} from './actions';

export const dynamic = 'force-dynamic';

const TTYPES: TestType[] = ['OUT_OF_COMPETITION', 'IN_COMPETITION'];
const SAMPLES: SampleType[] = ['URINE', 'BLOOD'];
const SANCTIONS: SanctionType[] = ['SUSPENSION', 'WARNING', 'DQ'];
const OUTCOME_TONE: Record<string, 'amber' | 'green' | 'red'> = { PENDING: 'amber', NEGATIVE: 'green', AAF: 'red' };
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function AntidopingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [ov, tests, sanctions, courses, tues, sports] = await Promise.all([
    getAntidopingOverview().catch(() => ({ pendingTests: 0, aafCount: 0, activeSanctions: 0, educationRecords: 0 })),
    listTests({}).catch(() => []),
    listSanctions({}).catch(() => []),
    listEducationCourses().catch(() => []),
    listTue({}).catch(() => []),
    listSports({ onlyActive: true }).catch(() => []),
  ]);
  const pl = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const sportOptions = (name: string, req = false) => (
    <select name={name} required={req} defaultValue="" className={input}>
      <option value="">{t('adop.sport')}</option>
      {sports.map((s) => <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('adop.title')} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t('adop.pendingTests')} value={ov.pendingTests} />
        <StatCard label={t('adop.aafCount')} value={ov.aafCount} />
        <StatCard label={t('adop.activeSanctions')} value={ov.activeSanctions} />
        <StatCard label={t('adop.educationRecords')} value={ov.educationRecords} />
      </div>

      {/* 검사 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('adop.tests')}</h2>
        <Card>
          <form action={recordTestForm.bind(null, locale)} className="grid gap-2 sm:grid-cols-5 sm:items-end">
            <div className="text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">{t('adop.person')}</span>
              <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
            </div>
            {sportOptions('sport_id')}
            <select name="test_type" defaultValue="OUT_OF_COMPETITION" className={input}>
              {TTYPES.map((x) => <option key={x} value={x}>{t(`adop.ttype.${x}`)}</option>)}
            </select>
            <div className="flex gap-2">
              <select name="sample_type" defaultValue="URINE" className={input}>
                {SAMPLES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <input name="sample_code" placeholder={t('adop.sampleCode')} className={input} />
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 sm:col-span-1">{t('adop.recordTest')}</button>
          </form>
        </Card>
        {tests.length === 0 ? (
          <EmptyState message={t('adop.empty')} />
        ) : (
          <Table head={[t('adop.person'), t('adop.sport'), t('adop.testType'), t('adop.collectedAt'), t('adop.outcomeLabel'), t('adop.labResult')]}>
            {tests.map((x) => (
              <Tr key={x.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{x.full_name}</Td>
                <Td className="text-slate-600">{x.sport_name ? pick(x.sport_name, locale) : '—'}</Td>
                <Td className="text-slate-600">{t(`adop.ttype.${x.test_type}`)}</Td>
                <Td className="tabular-nums text-slate-400">{x.collected_at?.slice(0, 10)}</Td>
                <Td><Badge tone={OUTCOME_TONE[x.outcome] ?? 'amber'}>{t(`adop.outcome.${x.outcome}`)}</Badge></Td>
                <Td>
                  {x.outcome === 'PENDING' ? (
                    <form action={labResultForm.bind(null, locale)} className="flex items-center gap-1">
                      <input type="hidden" name="test_id" value={x.id} />
                      <select name="a_result" defaultValue="" className="rounded border border-slate-300 px-1 py-1 text-xs">
                        <option value="">A</option>
                        <option value="NEG">A: {t('adop.result.NEG')}</option>
                        <option value="POS">A: {t('adop.result.POS')}</option>
                      </select>
                      <select name="b_result" defaultValue="" className="rounded border border-slate-300 px-1 py-1 text-xs">
                        <option value="">B</option>
                        <option value="NEG">B: {t('adop.result.NEG')}</option>
                        <option value="POS">B: {t('adop.result.POS')}</option>
                      </select>
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">{t('common.save')}</button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">A:{x.a_result ?? '—'} B:{x.b_result ?? '—'}</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 제재 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('adop.sanctions')}</h2>
        <Card>
          <form action={decideSanctionForm.bind(null, locale)} className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
              <div className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-600">{t('adop.person')}</span>
                <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
              </div>
              {sportOptions('sport_id')}
              <select name="sanction_type" defaultValue="SUSPENSION" className={input}>
                {SANCTIONS.map((x) => <option key={x} value={x}>{t(`adop.stype.${x}`)}</option>)}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <input name="adrv_article" placeholder={t('adop.article')} className={input} />
              <input name="decision_no" placeholder={t('adop.decisionNo')} className={input} />
              <input type="date" name="starts_on" className={input} />
              <input type="date" name="ends_on" className={input} />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="is_public" /> {t('adop.public')}</label>
              <button className="rounded bg-rose-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-800">{t('adop.decideSanction')}</button>
            </div>
          </form>
        </Card>
        {sanctions.length === 0 ? (
          <EmptyState message={t('adop.empty')} />
        ) : (
          <Table head={[t('adop.person'), t('adop.sanctionTypeLabel'), t('adop.article'), t('adop.period'), t('adop.reflected'), t('adop.statusLabel'), '']}>
            {sanctions.map((sn) => (
              <Tr key={sn.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{sn.full_name}</Td>
                <Td><Badge tone={sn.sanction_type === 'WARNING' ? 'amber' : 'red'}>{t(`adop.stype.${sn.sanction_type}`)}</Badge></Td>
                <Td className="text-slate-600">{sn.adrv_article ?? '—'}</Td>
                <Td className="tabular-nums text-slate-500">{sn.starts_on?.slice(0, 10) ?? '—'}{sn.ends_on ? ` ~ ${sn.ends_on.slice(0, 10)}` : ''}</Td>
                <Td>{sn.reflected_to_registration ? <Badge tone="green">✓</Badge> : '—'}</Td>
                <Td><Badge tone={sn.status === 'ACTIVE' ? 'red' : 'neutral'}>{t(`adop.sstatus.${sn.status}`)}</Badge></Td>
                <Td>
                  {sn.status === 'ACTIVE' ? (
                    <form action={liftSanctionForm.bind(null, locale)}>
                      <input type="hidden" name="sanction_id" value={sn.id} />
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">{t('adop.liftSanction')}</button>
                    </form>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 교육 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('adop.education')}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <form action={createCourseForm.bind(null, locale)} className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">{t('adop.newCourse')}</p>
              <input name="code" placeholder="CODE" className={input} />
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="name_vi" placeholder="VI" className={input} />
                <input name="name_en" placeholder="EN" className={input} />
                <input name="name_ko" placeholder="KO" className={input} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-600">{t('adop.validityMonths')} <input type="number" name="validity_months" defaultValue="12" min="1" className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm" /></label>
                <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" name="is_mandatory" defaultChecked /> {t('adop.mandatory')}</label>
              </div>
              <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('adop.newCourse')}</button>
            </form>
          </Card>
          <Card>
            <form action={recordCompletionForm.bind(null, locale)} className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">{t('adop.recordCompletion')}</p>
              <select name="course_id" required defaultValue="" className={input}>
                <option value="" disabled>{t('adop.course')}</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{pick(c.name_i18n, locale)}</option>)}
              </select>
              <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
              {sportOptions('sport_id')}
              <input type="number" name="score" placeholder={t('adop.score')} className={input} />
              <button className="rounded bg-[#15607A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0e4356]">{t('adop.recordCompletion')}</button>
            </form>
          </Card>
        </div>
        {courses.length > 0 ? (
          <Table head={[t('adop.course'), t('adop.validityMonths'), t('adop.mandatory'), t('adop.records')]}>
            {courses.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{pick(c.name_i18n, locale)}{c.code ? <span className="ml-1.5 font-mono text-xs text-slate-400">{c.code}</span> : null}</Td>
                <Td className="tabular-nums text-slate-600">{c.validity_months}</Td>
                <Td>{c.is_mandatory ? <Badge tone="blue">✓</Badge> : '—'}</Td>
                <Td className="tabular-nums text-slate-700">{c.record_count}</Td>
              </Tr>
            ))}
          </Table>
        ) : null}
      </section>

      {/* 치료목적 사용면책 (TUE) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('adop.tueTitle')}</h2>
        <Card>
          <form action={submitTueForm.bind(null, locale)} className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">{t('adop.newTue')}</p>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
              <div className="text-sm sm:col-span-2">
                <span className="mb-1 block text-slate-600">{t('adop.person')}</span>
                <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
              </div>
              <input name="substance" required placeholder={t('adop.substance')} className={input} />
              {sportOptions('sport_id')}
            </div>
            <input name="reason" placeholder={t('adop.reasonLabel')} className={input} />
            <div className="flex items-end gap-2">
              <label className="text-sm text-slate-600">{t('adop.validity')}
                <div className="mt-1 flex gap-2">
                  <input type="date" name="valid_from" className={input} />
                  <input type="date" name="valid_to" className={input} />
                </div>
              </label>
              <button className="ml-auto rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('adop.newTue')}</button>
            </div>
          </form>
        </Card>
        {tues.length === 0 ? (
          <EmptyState message={t('adop.noTue')} />
        ) : (
          <Table head={[t('adop.person'), t('adop.substance'), t('adop.validity'), t('adop.statusLabel'), '']}>
            {tues.map((tue) => (
              <Tr key={tue.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">
                  {tue.full_name}
                  {tue.verify_code ? <span className="ml-1.5 font-mono text-[11px] text-slate-400">{tue.verify_code}</span> : null}
                </Td>
                <Td className="text-slate-700 wrap-anywhere">{tue.substance}</Td>
                <Td className="tabular-nums text-slate-500">{tue.valid_from?.slice(0, 10) ?? '—'}{tue.valid_to ? ` ~ ${tue.valid_to.slice(0, 10)}` : ''}</Td>
                <Td><Badge tone={tue.decision === 'APPROVED' ? 'green' : tue.decision === 'REJECTED' ? 'red' : 'amber'}>{t(`adop.tuestatus.${tue.decision}`)}</Badge></Td>
                <Td>
                  {tue.decision === 'PENDING' ? (
                    <div className="flex gap-1">
                      <form action={decideTueForm.bind(null, locale)}>
                        <input type="hidden" name="tue_id" value={tue.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <button className="rounded border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">{t('adop.approve')}</button>
                      </form>
                      <form action={decideTueForm.bind(null, locale)}>
                        <input type="hidden" name="tue_id" value={tue.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">{t('adop.reject')}</button>
                      </form>
                    </div>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
