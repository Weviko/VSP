import Link from 'next/link';
import { t as pick, type UUID } from '@vsp/core-admin';
import { getRegistration, checkEligibility, REG_TYPE_LABELS } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { approveRegistrationForm, rejectRegistrationForm } from './actions';

export const dynamic = 'force-dynamic';

/**
 * 경기인 등록 상세·처리.
 *
 * 신청 내용·자격 검증 결과를 한 화면에서 보고 승인/반려한다.
 * 자격 검증(등록·승인·정지·미납)은 대회 참가 신청 때 도는 것과 같은 규칙을 미리 보여준다.
 */
export default async function RegistrationDetail({
  params,
}: {
  params: Promise<{ locale: string; regId: string }>;
}) {
  const { locale: raw, regId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const reg = await getRegistration(regId as UUID);
  if (!reg) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.registrations')} />
        <EmptyState message={t('common.noData')} />
        <Link href={`/${locale}/admin/registrations`} className="text-sm text-sky-700 hover:underline">← {t('nav.registrations')}</Link>
      </div>
    );
  }

  const elig = await checkEligibility(reg.person_id, reg.sport_id, reg.season_id, { requirePayment: true }).catch(() => null);
  const pending = reg.status === 'SUBMITTED' || reg.status === 'IN_REVIEW' || reg.status === 'DRAFT';

  const facts: Array<[string, string]> = [
    [t('nav.sports'), pick(reg.sport_name, locale)],
    [t('reg.type'), pick(REG_TYPE_LABELS[reg.reg_type] ?? { vi: reg.reg_type }, locale)],
    [t('org.name'), pick(reg.org_name, locale)],
    [t('reg.jersey'), reg.jersey_no ?? '—'],
    [t('reg.license'), [reg.license_grade, reg.license_no].filter(Boolean).join(' · ') || '—'],
    [t('reg.licenseExpires'), reg.license_expires_on ?? '—'],
    [t('reg.body'), reg.height_cm || reg.weight_kg ? `${reg.height_cm ?? '—'}cm · ${reg.weight_kg ?? '—'}kg` : '—'],
    [t('reg.approvedAt'), reg.approved_at ? reg.approved_at.slice(0, 10) : '—'],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/registrations`} className="text-sm text-sky-700 hover:underline">← {t('nav.registrations')}</Link>
      </div>

      <PageHeader
        title={reg.full_name}
        subtitle={reg.birth_date ? `${reg.birth_date}${reg.gender ? ` · ${reg.gender}` : ''}` : (reg.gender ?? '')}
        right={<Badge tone={statusTone(reg.status)}>{t(`status.${reg.status}`)}</Badge>}
      />

      {/* 처리 (대기 상태일 때) */}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <span className="text-sm text-amber-900">{t('reg.pendingHint')}</span>
          <span className="ml-auto flex gap-2">
            <form action={approveRegistrationForm.bind(null, locale, reg.id)}>
              <button className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">{t('common.approve')}</button>
            </form>
            <form action={rejectRegistrationForm.bind(null, locale, reg.id)} className="flex gap-2">
              <input name="reason" placeholder={t('reg.rejectReason')} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
              <button className="rounded border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">{t('common.reject')}</button>
            </form>
          </span>
        </div>
      ) : null}

      {/* 신청 내용 */}
      <Card>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-slate-800 wrap-anywhere">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* 자격 검증 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t('reg.eligibility')}</h2>
        {!elig ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={elig.eligible ? 'green' : 'red'}>{t(elig.eligible ? 'reg.eligible' : 'reg.notEligible')}</Badge>
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              {Object.entries(elig.checks).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className={v ? 'text-emerald-600' : 'text-red-500'}>{v ? '✓' : '✕'}</span>
                  <span className="text-slate-700">{t(`reg.check.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
