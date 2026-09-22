import Link from 'next/link';
import { trackIntegrityReport, type IntegrityTrackResult } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge } from '@vsp/web-shared/ui';

/**
 * 진행 조회 (대외, 읽기 전용, 로그인 불필요).
 * 접수번호(평문) 한 건으로 상태만 조회한다. 서버 액션 없이 GET 폼 + pub 함수만 쓴다.
 * 본문·관계인은 반환되지 않는다(규칙은 020).
 */
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'green' | 'neutral'> = {
  RECEIVED: 'amber', SCREENING: 'amber', INVESTIGATING: 'blue', DECIDED: 'blue', CLOSED: 'green', DISMISSED: 'neutral',
};

export default async function IntegrityTrackPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale: raw } = await params;
  const { code } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const result: IntegrityTrackResult | null = code
    ? await trackIntegrityReport(code).catch(() => ({ found: false }) as IntegrityTrackResult)
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href={`/${locale}/integrity`} className="text-sm text-[#15607A] hover:underline">← {t('integrity.centerTitle')}</Link>
      </div>
      <PageHeader title={t('integrity.trackTitle')} />
      <p className="-mt-3 text-sm text-slate-600">{t('integrity.trackHint')}</p>

      <form method="get" className="flex gap-2">
        <input
          name="code"
          defaultValue={code ?? ''}
          placeholder="ABCDEFGHJ"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-widest"
        />
        <button className="rounded bg-[#15607A] px-4 py-2 text-sm font-medium text-white hover:bg-[#0e4356]">
          {t('integrity.track')}
        </button>
      </form>

      {result ? (
        result.found ? (
          <Card className="border-emerald-300 bg-emerald-50">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{result.caseNo}</span>
              <Badge tone={STATUS_TONE[result.status ?? ''] ?? 'neutral'}>{t(`integrity.st.${result.status}`)}</Badge>
              {result.category ? <Badge tone="neutral">{t(`integrity.cat.${result.category}`)}</Badge> : null}
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">{t('integrity.received')}</dt>
                <dd className="tabular-nums text-slate-700">{result.receivedAt?.slice(0, 10) ?? '-'}</dd>
              </div>
              {result.decidedAt ? (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">{t('integrity.decided')}</dt>
                  <dd className="tabular-nums text-slate-700">{result.decidedAt.slice(0, 10)}</dd>
                </div>
              ) : null}
              {result.closedAt ? (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">{t('integrity.closed')}</dt>
                  <dd className="tabular-nums text-slate-700">{result.closedAt.slice(0, 10)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        ) : (
          <Card className="border-red-300 bg-red-50">
            <Badge tone="red">{t('integrity.trackNotFound')}</Badge>
          </Card>
        )
      ) : null}
    </div>
  );
}
