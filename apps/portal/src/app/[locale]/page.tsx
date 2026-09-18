import Link from 'next/link';
import {
  listSports, listEvents, listSportStats, listGrantDisclosures, getStats, getAd, t as pick,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { EmptyState, Badge } from '@vsp/web-shared/ui';

/**
 * 공개 홈 — 데스크톱 웹사이트 우선, 스마트폰 반응형.
 *
 * 네이버 스포츠 데스크톱처럼 위에 경기 스트립, 아래는 본문(주요 소식·종목) + 우측 사이드바(현황·바로가기).
 * 큰 화면에서는 2단, 좁은 화면에서는 한 단으로 접힌다.
 * 행정 화면에서 입력된 데이터가 여기에 자동으로 나타난다 — 별도 편집이 없다.
 */
export const dynamic = 'force-dynamic';

export default async function PublicHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const today = new Date().toISOString().slice(0, 10);

  let sports: Awaited<ReturnType<typeof listSports>> = [];
  let upcoming: Awaited<ReturnType<typeof listEvents>> = [];
  let stats: Awaited<ReturnType<typeof listSportStats>> = [];
  let totals: Awaited<ReturnType<typeof getStats>>['totals'] | null = null;
  let grants: Awaited<ReturnType<typeof listGrantDisclosures>> = [];

  try {
    [sports, upcoming, stats, grants] = await Promise.all([
      listSports(),
      listEvents({ from: today, limit: 12 }),
      listSportStats(),
      listGrantDisclosures().then((g) => g.slice(0, 4)).catch(() => []),
    ]);
    totals = (await getStats().catch(() => null))?.totals ?? null;
  } catch {
    // DB가 없어도 사이트 틀은 떠야 한다
  }
  const ad = await getAd('HOME_TOP').catch(() => null);

  const statBySport = new Map(stats.map((s) => [s.sport_id, s]));
  const topSports = [...sports].sort(
    (a, b) => (statBySport.get(b.id)?.athletes ?? 0) - (statBySport.get(a.id)?.athletes ?? 0)
  ).slice(0, 8);

  return (
    <div className="space-y-8">
      {/* 광고 지면 (HOME_TOP) — 활성·게재중일 때만 노출. 없으면 아무것도 안 그린다. */}
      {ad ? (
        <a
          href={ad.link_url ?? '#'}
          target="_blank"
          rel="noreferrer nofollow sponsored"
          className="block overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          {ad.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.image_url} alt={ad.sponsor_name ?? ''} className="w-full object-cover" />
          ) : (
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-medium text-slate-800">{ad.sponsor_name}</span>
              <span className="text-xs text-slate-400">{t('ad.label')}</span>
            </div>
          )}
        </a>
      ) : null}

      {/* 히어로 + 현황 요약 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('app.name')}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{t('app.tagline')}</p>
        {totals ? (
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t('sport.athletes'), totals.athletes],
              [t('nav.orgs'), totals.orgs],
              [t('nav.events'), totals.events],
              [t('nav.sports'), totals.sports],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 px-4 py-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value as number}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {/* 오늘 이후 경기/대회 스트립 (가로 스크롤) */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t('event.title')}</h2>
          <Link href={`/${locale}/events`} className="text-sm text-slate-500 hover:text-slate-900">
            {t('common.total')} →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState message={t('event.empty')} />
        ) : (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {upcoming.map((e) => (
              <Link
                key={e.id}
                href={`/${locale}/events/${e.id}`}
                className="w-64 shrink-0 snap-start rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400"
              >
                {e.sport_name ? (
                  <Badge tone="blue">{pick(e.sport_name, locale)}</Badge>
                ) : null}
                <p className="mt-2 line-clamp-2 min-h-[2.5rem] font-medium text-slate-900 wrap-anywhere">
                  {pick(e.name_i18n, locale)}
                </p>
                <p className="mt-2 text-sm tabular-nums text-slate-600">{e.starts_on} ~ {e.ends_on}</p>
                {e.venue_text ? <p className="mt-0.5 text-sm text-slate-500 wrap-anywhere">{e.venue_text}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 본문 2단: 종목 (본문) + 사이드바 (현황·바로가기·공시) */}
      <div className="grid gap-8 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">{t('sport.title')}</h2>
          {sports.length === 0 ? (
            <EmptyState message={t('sport.empty')} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {sports.map((s) => {
                const st = statBySport.get(s.id);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/${locale}/${s.code.toLowerCase()}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{pick(s.name_i18n, locale)}</p>
                        {st ? (
                          <p className="mt-1 text-sm tabular-nums text-slate-500">
                            {t('sport.athletes')} {st.athletes} · {t('sport.upcoming')} {st.upcoming_events}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {s.is_olympic ? <Badge tone="blue">Olympic</Badge> : null}
                        {s.is_seagames ? <Badge>SEA</Badge> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">{t('nav.rankings')}</h3>
            <ol className="mt-3 space-y-2">
              {topSports.map((s, i) => (
                <li key={s.id}>
                  <Link
                    href={`/${locale}/${s.code.toLowerCase()}`}
                    className="flex items-center gap-3 rounded px-1 py-1 text-sm hover:bg-slate-50"
                  >
                    <span className="w-4 text-center font-mono text-slate-400">{i + 1}</span>
                    <span className="flex-1 truncate text-slate-800">{pick(s.name_i18n, locale)}</span>
                    <span className="tabular-nums text-slate-500">{statBySport.get(s.id)?.athletes ?? 0}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">{t('nav.openinfo')}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href={`/${locale}/orgs`} className="text-slate-700 hover:text-slate-950">{t('nav.orgs')} →</Link></li>
              <li><Link href={`/${locale}/orgs/disclosure`} className="text-slate-700 hover:text-slate-950">{t('nav.disclosure')} →</Link></li>
              <li><Link href={`/${locale}/info/grants`} className="text-slate-700 hover:text-slate-950">{t('grant.title')} →</Link></li>
              <li><Link href={`/${locale}/info/stats`} className="text-slate-700 hover:text-slate-950">{t('nav.stats')} →</Link></li>
              <li><Link href={`/${locale}/verify`} className="text-slate-700 hover:text-slate-950">{t('nav.verify')} →</Link></li>
            </ul>
          </div>

          {grants.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">{t('grant.title')}</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {grants.map((g) => (
                  <li key={g.award_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-700">{pick(g.org_name, locale)}</span>
                    <span className="shrink-0 font-mono text-xs text-slate-400">{g.fiscal_year}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
