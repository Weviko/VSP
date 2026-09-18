import { getStats, REG_TYPE_LABELS, t as pick, type RegType } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, StatCard, EmptyState, Table, Tr, Td } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/** 막대 하나. 차트 라이브러리 없이 비율을 보여준다(번들 크기·저사양 기기 고려). */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
      <div className="h-full rounded bg-slate-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function StatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const stats = await getStats().catch(() => null);

  if (!stats) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('stats.title')} />
        <EmptyState message={t('common.noData')} />
      </div>
    );
  }

  const maxSport = Math.max(1, ...stats.bySport.map((s) => s.athletes));
  const maxRegion = Math.max(1, ...stats.byRegion.map((r) => r.athletes));
  const maxAge = Math.max(1, ...stats.byAge.map((a) => a.total));

  return (
    <div className="space-y-8">
      <PageHeader title={t('stats.title')} subtitle={t('app.tagline')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('sport.athletes')} value={stats.totals.athletes} />
        <StatCard label={t('nav.orgs')} value={stats.totals.orgs} />
        <StatCard label={t('nav.events')} value={stats.totals.events} />
        <StatCard label={t('nav.sports')} value={stats.totals.sports} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('stats.byType')}</h2>
        {stats.byType.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('reg.type'), t('common.total'), t('search.male'), t('search.female')]}>
            {stats.byType.map((r) => (
              <Tr key={r.reg_type}>
                <Td className="font-medium text-slate-900">
                  {pick(REG_TYPE_LABELS[r.reg_type as RegType] ?? { vi: r.reg_type }, locale)}
                </Td>
                <Td className="tabular-nums font-medium">{r.total}</Td>
                <Td className="tabular-nums text-slate-600">{r.male}</Td>
                <Td className="tabular-nums text-slate-600">{r.female}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('stats.bySport')}</h2>
        {stats.bySport.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <ul className="space-y-2">
            {stats.bySport.map((s) => (
              <li key={s.sport_id} className="rounded border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-900">{pick(s.sport_name, locale)}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {t('sport.athletes')} {s.athletes} · {t('nav.events')} {s.events}
                  </span>
                </div>
                <div className="mt-2">
                  <Bar value={s.athletes} max={maxSport} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('stats.byRegion')}</h2>
        {stats.byRegion.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {stats.byRegion.map((r) => (
              <li key={r.region_code ?? 'none'} className="rounded border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-900">{r.region_code ?? '-'}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {r.athletes} / {r.orgs}
                  </span>
                </div>
                <div className="mt-2">
                  <Bar value={r.athletes} max={maxRegion} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('stats.byAge')}</h2>
        {stats.byAge.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <ul className="space-y-2">
            {stats.byAge.map((a) => (
              <li key={a.age_group} className="rounded border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-900">{a.age_group}</span>
                  <span className="tabular-nums text-slate-600">{a.total}</span>
                </div>
                <div className="mt-2">
                  <Bar value={a.total} max={maxAge} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
