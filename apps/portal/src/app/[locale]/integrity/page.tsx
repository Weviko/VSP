import Link from 'next/link';
import { listIntegrityCases, t as pick, type PublicIntegrityCase } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, EmptyState } from '@vsp/web-shared/ui';

/**
 * 공정체육 신고센터 (대외, 읽기 전용).
 * 제도·제보자 보호 안내 + 종결·공개된 비식별 사례 + 접수/진행조회 CTA.
 * 신원은 pub 에 없으므로 여기서 나올 수 없다. 접수(쓰기)는 업무 플랫폼 /report 가 담당한다.
 */
export const dynamic = 'force-dynamic';

export default async function IntegrityCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const platformUrl = process.env.VSP_PLATFORM_URL ?? 'http://localhost:3001';

  const cases: PublicIntegrityCase[] = await listIntegrityCases(50).catch(() => []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('integrity.centerTitle')} />
      <p className="-mt-3 text-sm text-slate-600">{t('integrity.centerIntro')}</p>

      {/* 안내 + CTA */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-[#15607A]/20 bg-[#15607A]/5">
          <p className="text-sm text-slate-700">{t('integrity.protectNote')}</p>
          <a
            href={`${platformUrl}/${locale}/report`}
            className="mt-3 inline-block rounded-lg bg-[#15607A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e4356]"
          >
            {t('integrity.ctaReport')}
          </a>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-800">{t('integrity.trackTitle')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('integrity.trackHint')}</p>
          <Link
            href={`/${locale}/integrity/track`}
            className="mt-3 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {t('integrity.track')} →
          </Link>
        </Card>
      </div>

      {/* 공개 사례 */}
      <section className="space-y-3">
        <h2 className="border-l-[3px] border-[#15607A] pl-2.5 text-lg font-semibold text-slate-900">{t('integrity.cases')}</h2>
        {cases.length === 0 ? (
          <EmptyState message={t('integrity.empty')} />
        ) : (
          <ul className="space-y-3">
            {cases.map((c) => (
              <li key={c.case_no} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">{c.case_no}</span>
                  <Badge tone="neutral">{t(`integrity.cat.${c.category}`)}</Badge>
                  {c.sport_name ? <span className="text-xs text-slate-500">{pick(c.sport_name, locale)}</span> : null}
                  {c.measure_type ? <Badge tone="red">{t(`integrity.mt.${c.measure_type}`)}</Badge> : null}
                  <span className="ml-auto tabular-nums text-xs text-slate-400">{(c.closed_at ?? c.decided_at)?.slice(0, 10)}</span>
                </div>
                {c.public_summary_i18n ? (
                  <p className="mt-2 text-sm text-slate-700 wrap-anywhere">{pick(c.public_summary_i18n, locale)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
