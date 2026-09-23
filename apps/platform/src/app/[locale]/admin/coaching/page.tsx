import Link from 'next/link';
import { t as pick } from '@vsp/core-admin';
import {
  getCoachingOverview, listGrades, listCourses, listCredentials, listExpiringCredentials, listSports,
  type CourseType,
} from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, StatCard, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import {
  upsertGradeForm, createCourseForm, grantCredentialForm, renewCredentialForm, setCoachCredentialStatusForm, searchPersonsAction,
} from './actions';

export const dynamic = 'force-dynamic';

const CTYPES: CourseType[] = ['REFRESHER', 'QUALIFICATION'];
const CRED_TONE: Record<string, 'green' | 'red' | 'amber' | 'neutral'> = { VALID: 'green', EXPIRED: 'amber', SUSPENDED: 'red', REVOKED: 'neutral' };
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function CoachingPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ err?: string; earn?: string; req?: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const sp = await searchParams;

  const [ov, grades, courses, credentials, expiring, sports] = await Promise.all([
    getCoachingOverview().catch(() => ({ validCredentials: 0, expiringSoon: 0, openCourses: 0, grades: 0 })),
    listGrades({}).catch(() => []),
    listCourses({}).catch(() => []),
    listCredentials({}).catch(() => []),
    listExpiringCredentials(90).catch(() => []),
    listSports({ onlyActive: true }).catch(() => []),
  ]);
  const pl = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const base = `/${locale}/admin/coaching`;
  const sportSel = (name: string) => (
    <select name={name} defaultValue="" className={input}>
      <option value="">{t('nav.sports')} —</option>
      {sports.map((s) => <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('coach.title')} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t('coach.validCredentials')} value={ov.validCredentials} />
        <StatCard label={t('coach.expiringSoon')} value={ov.expiringSoon} />
        <StatCard label={t('coach.openCourses')} value={ov.openCourses} />
        <StatCard label={t('coach.gradesCount')} value={ov.grades} />
      </div>

      {sp.err === 'refresher' ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {t('coach.refresherMissing', { earned: sp.earn ?? '0', required: sp.req ?? '0' })}
        </p>
      ) : null}

      {/* 자격 등급 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('coach.grades')}</h2>
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('coach.newGrade')}</summary>
            <form action={upsertGradeForm.bind(null, locale)} className="mt-3 grid gap-2 sm:grid-cols-3 sm:items-end">
              <input name="code" placeholder="CODE" required className={input} />
              <input name="name_vi" placeholder="VI" className={input} />
              <input name="name_ko" placeholder="KO" className={input} />
              {sportSel('sport_id')}
              <label className="text-sm text-slate-600">{t('coach.levelOrder')} <input type="number" name="level_order" defaultValue="1" min="1" className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm" /></label>
              <label className="text-sm text-slate-600">{t('coach.validityYears')} <input type="number" name="validity_years" defaultValue="4" min="1" className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm" /></label>
              <label className="text-sm text-slate-600">{t('coach.refresherHours')} <input type="number" name="refresher_hours_required" defaultValue="0" min="0" className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm" /></label>
              <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('coach.newGrade')}</button>
            </form>
          </details>
        </Card>
        {grades.length === 0 ? <EmptyState message={t('coach.noGrades')} /> : (
          <Table head={[t('coach.grade'), t('nav.sports'), t('coach.levelOrder'), t('coach.validityYears'), t('coach.refresherHours'), t('coach.validCredentials')]}>
            {grades.map((g) => (
              <Tr key={g.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{pick(g.name_i18n, locale)} <span className="font-mono text-xs text-slate-400">{g.code}</span></Td>
                <Td className="text-slate-600">{g.sport_name ? pick(g.sport_name, locale) : '—'}</Td>
                <Td className="tabular-nums text-slate-600">{g.level_order}</Td>
                <Td className="tabular-nums text-slate-600">{g.validity_years}</Td>
                <Td className="tabular-nums text-slate-600">{g.refresher_hours_required}</Td>
                <Td className="tabular-nums text-slate-700">{g.credential_count}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 연수 과정 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('coach.courses')}</h2>
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('coach.newCourse')}</summary>
            <form action={createCourseForm.bind(null, locale)} className="mt-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="cname_vi" placeholder="VI" className={input} />
                <input name="cname_en" placeholder="EN" className={input} />
                <input name="cname_ko" placeholder="KO" className={input} />
              </div>
              <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                <select name="grade_id" defaultValue="" className={input}>
                  <option value="">{t('coach.grade')} —</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{pick(g.name_i18n, locale)}</option>)}
                </select>
                <select name="course_type" defaultValue="REFRESHER" className={input}>
                  {CTYPES.map((c) => <option key={c} value={c}>{t(`coach.ctype.${c}`)}</option>)}
                </select>
                <input type="number" name="hours" placeholder={t('coach.hours')} min="0" className={input} />
                <input type="number" name="capacity" placeholder={t('club.capacity')} min="1" className={input} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" name="starts_on" className={input} />
                <input type="date" name="ends_on" className={input} />
              </div>
              <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('coach.newCourse')}</button>
            </form>
          </details>
        </Card>
        {courses.length === 0 ? <EmptyState message={t('coach.noCourses')} /> : (
          <Table head={[t('coach.course'), t('coach.ctype.REFRESHER'), t('coach.hours'), t('coach.enroll'), t('integrity.status'), '']}>
            {courses.map((c) => (
              <Tr key={c.id}>
                <Td><Link href={`${base}/courses/${c.id}`} className="font-medium text-slate-900 hover:underline">{pick(c.name_i18n, locale)}</Link></Td>
                <Td><Badge tone="neutral">{t(`coach.ctype.${c.course_type}`)}</Badge></Td>
                <Td className="tabular-nums text-slate-600">{c.hours}</Td>
                <Td className="tabular-nums text-slate-700">{c.enrolled_count}{c.capacity != null ? `/${c.capacity}` : ''}</Td>
                <Td><Badge tone={c.status === 'OPEN' ? 'green' : 'neutral'}>{t(`coach.cstatus.${c.status}`)}</Badge></Td>
                <Td><Link href={`${base}/courses/${c.id}`} className="text-sm text-[#15607A] hover:underline">→</Link></Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 자격 대장 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('coach.credentials')}</h2>
        <Card>
          <form action={grantCredentialForm.bind(null, locale)} className="grid gap-2 sm:grid-cols-4 sm:items-end">
            <div className="text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">{t('coach.person')}</span>
              <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
            </div>
            <select name="grade_id" required defaultValue="" className={input}>
              <option value="" disabled>{t('coach.grade')}</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{pick(g.name_i18n, locale)}</option>)}
            </select>
            {sportSel('sport_id')}
            <input type="date" name="obtained_on" className={input} />
            <button className="rounded bg-[#15607A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0e4356]">{t('coach.grant')}</button>
          </form>
        </Card>
        {credentials.length === 0 ? <EmptyState message={t('coach.noCredentials')} /> : (
          <Table head={[t('person.name'), t('coach.grade'), t('nav.sports'), t('coach.obtained'), t('coach.expires'), t('integrity.status'), '']}>
            {credentials.map((cr) => {
              const isExpiring = expiring.some((e) => e.id === cr.id);
              return (
                <Tr key={cr.id}>
                  <Td className="font-medium text-slate-900 wrap-anywhere">
                    {cr.full_name}
                    {cr.verify_code ? <span className="ml-1.5 font-mono text-[11px] text-slate-400" title={t('coach.verifyCode')}>{cr.verify_code}</span> : null}
                  </Td>
                  <Td className="text-slate-700">{pick(cr.grade_name, locale)}</Td>
                  <Td className="text-slate-600">{cr.sport_name ? pick(cr.sport_name, locale) : '—'}</Td>
                  <Td className="tabular-nums text-slate-500">{cr.obtained_on?.slice(0, 10)}</Td>
                  <Td className={'tabular-nums ' + (isExpiring ? 'font-semibold text-amber-700' : 'text-slate-500')}>{cr.expires_on?.slice(0, 10) ?? '—'}</Td>
                  <Td><Badge tone={CRED_TONE[cr.status] ?? 'neutral'}>{t(`coach.credstatus.${cr.status}`)}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      {cr.status === 'VALID' || cr.status === 'EXPIRED' ? (
                        <form action={renewCredentialForm.bind(null, locale)}>
                          <input type="hidden" name="credential_id" value={cr.id} />
                          <button className="rounded border border-[#15607A] px-2 py-1 text-xs text-[#15607A] hover:bg-sky-50">{t('coach.renew')}</button>
                        </form>
                      ) : null}
                      {cr.status === 'VALID' ? (
                        <form action={setCoachCredentialStatusForm.bind(null, locale)}>
                          <input type="hidden" name="credential_id" value={cr.id} />
                          <input type="hidden" name="status" value="SUSPENDED" />
                          <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">{t('coach.suspend')}</button>
                        </form>
                      ) : cr.status === 'SUSPENDED' ? (
                        <form action={setCoachCredentialStatusForm.bind(null, locale)}>
                          <input type="hidden" name="credential_id" value={cr.id} />
                          <input type="hidden" name="status" value="VALID" />
                          <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{t('coach.restore')}</button>
                        </form>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}
