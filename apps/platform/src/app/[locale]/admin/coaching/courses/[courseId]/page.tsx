import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t as pick } from '@vsp/core-admin';
import { getCourse, listCourseEnrollments, type CourseStatus, type EnrollmentStatus } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import { enrollCourseForm, markCompletionForm, setCourseStatusForm, searchPersonsAction } from '../../actions';

export const dynamic = 'force-dynamic';

const CSTATUS: CourseStatus[] = ['OPEN', 'CLOSED', 'FINISHED', 'DRAFT'];
const ESTATUS: EnrollmentStatus[] = ['ENROLLED', 'COMPLETED', 'FAILED', 'CANCELLED'];
const E_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = { COMPLETED: 'green', ENROLLED: 'amber', FAILED: 'red', CANCELLED: 'neutral' };
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function CourseDetailPage({ params }: { params: Promise<{ locale: string; courseId: string }> }) {
  const { locale: raw, courseId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const course = await getCourse(courseId).catch(() => null);
  if (!course) notFound();
  const enrollments = await listCourseEnrollments(courseId).catch(() => []);
  const pl = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };

  return (
    <div className="space-y-6">
      <div><Link href={`/${locale}/admin/coaching`} className="text-sm text-[#15607A] hover:underline">← {t('coach.title')}</Link></div>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={pick(course.name_i18n, locale)} />
        <Badge tone="neutral">{t(`coach.ctype.${course.course_type}`)}</Badge>
        <Badge tone={course.status === 'OPEN' ? 'green' : 'neutral'}>{t(`coach.cstatus.${course.status}`)}</Badge>
        <span className="text-sm text-slate-500">{course.hours}{t('coach.hours')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <form action={setCourseStatusForm.bind(null, locale, course.id)} className="flex items-center gap-1">
          <select name="status" defaultValue={course.status} className={input}>
            {CSTATUS.map((s) => <option key={s} value={s}>{t(`coach.cstatus.${s}`)}</option>)}
          </select>
          <button className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">{t('common.save')}</button>
        </form>
      </div>

      {course.status === 'OPEN' ? (
        <Card>
          <form action={enrollCourseForm.bind(null, locale, course.id)} className="flex items-end gap-2">
            <div className="flex-1 text-sm">
              <span className="mb-1 block text-slate-600">{t('coach.enroll')}</span>
              <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
            </div>
            <button className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('coach.enroll')}</button>
          </form>
        </Card>
      ) : null}

      {enrollments.length === 0 ? (
        <EmptyState message={t('coach.empty')} />
      ) : (
        <Table head={[t('person.name'), t('integrity.status'), t('coach.hoursEarned'), t('coach.score'), t('coach.complete')]}>
          {enrollments.map((e) => (
            <Tr key={e.id}>
              <Td className="font-medium text-slate-900 wrap-anywhere">{e.full_name}</Td>
              <Td><Badge tone={E_TONE[e.status] ?? 'neutral'}>{t(`coach.estatus.${e.status}`)}</Badge></Td>
              <Td className="tabular-nums text-slate-600">{e.hours_earned ?? '—'}</Td>
              <Td className="tabular-nums text-slate-600">{e.score ?? '—'}</Td>
              <Td>
                <form action={markCompletionForm.bind(null, locale, course.id)} className="flex items-center gap-1">
                  <input type="hidden" name="enrollment_id" value={e.id} />
                  <select name="status" defaultValue={e.status} className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                    {ESTATUS.map((s) => <option key={s} value={s}>{t(`coach.estatus.${s}`)}</option>)}
                  </select>
                  <input type="number" name="hours_earned" placeholder={t('coach.hours')} className="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                  <input type="number" name="score" placeholder={t('coach.score')} className="w-14 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                  <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">{t('common.save')}</button>
                </form>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
