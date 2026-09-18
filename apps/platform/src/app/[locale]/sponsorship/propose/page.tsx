import Link from 'next/link';
import { getSponsorshipTarget, t as pick, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState } from '@vsp/web-shared/ui';
import { requireMember } from '@/lib/session';
import { submitProposalForm } from './actions';

export const dynamic = 'force-dynamic';

/**
 * 후원 제안 화면 (업무 플랫폼, 로그인 필요).
 *
 * 공개 웹(포털)의 "후원 제안" 버튼이 여기로 보낸다. 대상이 후원 가능(open)일 때만 폼을 연다.
 * 플랫폼은 소개·매칭만 한다 — 예산은 참고 텍스트, 결제는 당사자 간 플랫폼 밖에서.
 */
export default async function ProposePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ athlete?: string; sent?: string; err?: string }>;
}) {
  const { locale: raw } = await params;
  const { athlete, sent, err } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  await requireMember(locale);

  const target = athlete ? await getSponsorshipTarget(athlete as UUID).catch(() => null) : null;

  if (!target) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title={t('sponsor.proposeTitle')} />
        <EmptyState message={athlete ? t('sponsor.notOpen') : t('sponsor.athleteNotFound')} />
        <Link href={`/${locale}/my`} className="text-sm text-sky-700 hover:underline">← {t('my.title')}</Link>
      </div>
    );
  }

  const name = target.name;
  const headline = pick(target.headline_i18n, locale);

  if (sent === '1') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title={t('sponsor.proposeTitle')} subtitle={name} />
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
          {t('sponsor.proposalSent')}
        </div>
        <Link href={`/${locale}/sponsorship/propose?athlete=${target.person_id}`} className="text-sm text-sky-700 hover:underline">
          {t('sponsor.propose')} →
        </Link>
      </div>
    );
  }

  const errMsg =
    err === 'CLOSED' ? t('sponsor.notOpen') :
    err === 'INPUT' ? t('common.required') : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('sponsor.proposeTitle')} subtitle={name} />
      {headline ? <p className="text-sm text-slate-600">{headline}</p> : null}
      <p className="text-sm text-slate-500">{t('sponsor.proposeIntro')}</p>

      {errMsg ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errMsg}</div>
      ) : null}

      <Card>
        <form action={submitProposalForm.bind(null, locale)} className="space-y-4">
          <input type="hidden" name="athlete_person_id" value={target.person_id} />
          <div>
            <label className="block text-sm text-slate-700">{t('sponsor.sponsorName')} <span className="text-red-500">*</span></label>
            <input
              type="text" name="sponsor_name" required maxLength={120}
              placeholder={t('sponsor.sponsorNamePh')}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700">{t('sponsor.contact')}</label>
            <input
              type="text" name="sponsor_contact" maxLength={200}
              placeholder={t('sponsor.contactPh')}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700">{t('sponsor.budget')}</label>
            <input
              type="text" name="budget" maxLength={120}
              placeholder={t('sponsor.budgetPh')}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700">{t('sponsor.message')}</label>
            <textarea
              name="message" rows={4} maxLength={2000}
              placeholder={t('sponsor.msgPh')}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              {t('sponsor.submitProposal')}
            </button>
            <Link href={`/${locale}/my`} className="text-sm text-slate-500 hover:underline">{t('common.cancel')}</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
