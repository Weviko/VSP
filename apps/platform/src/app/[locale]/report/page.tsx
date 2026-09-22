import Link from 'next/link';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { LocaleSwitch } from '@vsp/web-shared/LocaleSwitch';
import { submitIntegrityReport } from './actions';

/**
 * 공개 신고 접수 — 로그인 불필요, 익명 가능.
 * admin/my 밖의 공개 라우트라 권한 확인이 필요 없다(경계검사 [3] 대상 아님).
 * 접수 후 접수번호(평문)를 한 번만 표시한다(진행조회용).
 */
export const dynamic = 'force-dynamic';

const CATEGORIES = ['VIOLENCE', 'SEXUAL', 'MATCH_FIXING', 'CORRUPTION', 'OTHER'] as const;
const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

export default async function ReportPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filed?: string; code?: string; case?: string; err?: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const sp = await searchParams;
  const filed = sp.filed === '1' && sp.code;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-1 w-full bg-gradient-to-r from-[#15607A] via-[#1c7fa0] to-[#15607A]" />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#15607A] text-xs font-bold text-white">VSP</span>
            <span className="text-sm font-semibold text-slate-800">{t('integrity.centerTitle')}</span>
          </Link>
          <LocaleSwitch current={locale} />
        </div>

        {filed ? (
          <div className="rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
            <h1 className="text-lg font-bold text-slate-900">{t('integrity.reportFiledTitle')}</h1>
            <p className="mt-3 text-sm text-slate-600">{t('integrity.trackCode')}</p>
            <p className="my-2 select-all font-mono text-2xl font-bold tracking-widest text-[#15607A]">{sp.code}</p>
            {sp.case ? <p className="text-xs text-slate-400">{sp.case}</p> : null}
            <p className="mx-auto mt-3 max-w-md text-xs text-amber-700">{t('integrity.trackCodeNote')}</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href={`/${locale}/report`} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">{t('integrity.fileReport')}</Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">{t('integrity.reportTitle')}</h1>
            <p className="mt-2 text-sm text-slate-600">{t('integrity.reportIntro')}</p>
            <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">{t('integrity.protectNote')}</div>

            {sp.err ? (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t('common.noData')}</p>
            ) : null}

            <form action={submitIntegrityReport.bind(null, locale)} className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{t('integrity.category')}</span>
                <select name="category" defaultValue="OTHER" className={input}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(`integrity.cat.${c}`)}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{t('doc.subject')}</span>
                <input name="title" required className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{t('integrity.detail')}</span>
                <textarea name="detail" rows={5} className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">{t('integrity.respondent')}</span>
                <input name="respondent" className={input} />
              </label>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" name="anonymous" /> {t('integrity.anonymous')}
                </label>
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-slate-600">{t('integrity.reporterContact')}</span>
                  <input name="contact" className={input} />
                </label>
              </div>

              <button className="w-full rounded-lg bg-[#15607A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0e4356]">
                {t('integrity.fileReport')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
