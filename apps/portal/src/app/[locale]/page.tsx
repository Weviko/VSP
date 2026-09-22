import Link from 'next/link';
import {
  listSports, listEvents, listScoreboard, listNews, listStandingBoards, getStandings,
  listSponsorshipOpen, getStats, getAd, t as pick,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { EmptyState, Badge } from '@vsp/web-shared/ui';

/**
 * 공개 홈 — 네이버 스포츠형. 위에 경기 스코어 스트립, 본문에 뉴스, 우측에 순위·후원·종목.
 * 행정 화면에서 입력된 데이터가 여기에 자동으로 나타난다.
 * 후원(스폰서)을 전면에 둔다 — 선수 카드에서 프로필로, 프로필에서 후원 문의로 이어진다.
 */
export const dynamic = 'force-dynamic';

export default async function PublicHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const today = new Date().toISOString().slice(0, 10);

  const [sports, scores, news, boards, sponsors, upcoming] = await Promise.all([
    listSports().catch(() => []),
    listScoreboard({ limit: 10 }).catch(() => []),
    listNews({ limit: 6 }).catch(() => []),
    listStandingBoards().catch(() => []),
    listSponsorshipOpen(6).catch(() => []),
    listEvents({ from: today, limit: 8 }).catch(() => []),
  ]);
  const totals = (await getStats().catch(() => null))?.totals ?? null;
  const ad = await getAd('HOME_TOP').catch(() => null);
  const ranking = boards[0] ? await getStandings(boards[0].id).catch(() => null) : null;

  const featuredNews = news[0] ?? null;
  const restNews = news.slice(1, 5);

  return (
    <div className="space-y-6">
      {/* 광고 지면 (HOME_TOP) */}
      {ad ? (
        <a href={ad.link_url ?? '#'} target="_blank" rel="noreferrer nofollow sponsored"
          className="block overflow-hidden rounded-xl border border-slate-200 bg-white">
          {ad.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.image_url} alt={ad.sponsor_name ?? ''} className="w-full object-cover" />
          ) : (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="font-medium text-slate-800">{ad.sponsor_name}</span>
              <span className="text-xs text-slate-400">{t('ad.label')}</span>
            </div>
          )}
        </a>
      ) : null}

      {/* 슬림 헤더 + 현황 칩 */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{t('app.name')}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t('app.tagline')}</p>
        </div>
        {totals ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {[
              [t('sport.athletes'), totals.athletes],
              [t('nav.orgs'), totals.orgs],
              [t('nav.events'), totals.events],
              [t('nav.sports'), totals.sports],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline gap-1.5">
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="text-base font-bold tabular-nums text-slate-900">{value as number}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {/* 경기 스코어 스트립 (네이버 스포츠 상단) */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-slate-900">{t('score.title')}</h2>
          <Link href={`/${locale}/scoreboard`} className="text-sm text-slate-500 hover:text-slate-900">{t('common.total')} →</Link>
        </div>
        {scores.length === 0 ? (
          <EmptyState message={t('score.empty')} />
        ) : (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {scores.map((m) => {
              const a = m.sides[0]; const b = m.sides[1];
              const live = m.status === 'LIVE' || m.status === 'IN_PROGRESS';
              const done = m.status === 'FINISHED' || m.status === 'DONE' || m.status === 'FINAL';
              return (
                <Link key={m.match_id} href={`/${locale}/matches/${m.match_id}`}
                  className="flex w-60 shrink-0 snap-start flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-400">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-slate-500">{m.sport_name ? pick(m.sport_name, locale) : ''}</span>
                    {live ? <span className="rounded bg-rose-500 px-1.5 py-0.5 font-bold text-white">LIVE</span>
                      : <span className="tabular-nums text-slate-400">{m.on_date}</span>}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{a?.label ?? '-'}</span>
                      <span className={`tabular-nums text-lg font-bold ${done || live ? 'text-slate-900' : 'text-slate-300'}`}>{a?.score ?? '-'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{b?.label ?? '-'}</span>
                      <span className={`tabular-nums text-lg font-bold ${done || live ? 'text-slate-900' : 'text-slate-300'}`}>{b?.score ?? '-'}</span>
                    </div>
                  </div>
                  <div className="truncate text-xs text-slate-400">{pick(m.event_name, locale)}{m.round_name ? ` · ${m.round_name}` : ''}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 본문 2단: 뉴스(주) + 사이드바(순위·후원·종목·공개정보) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 뉴스 */}
        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold text-slate-900">{t('nav.news')}</h2>
            <Link href={`/${locale}/news`} className="text-sm text-slate-500 hover:text-slate-900">{t('common.total')} →</Link>
          </div>
          {news.length === 0 ? (
            <EmptyState message={t('common.noData')} />
          ) : (
            <div className="space-y-4">
              {featuredNews ? (
                <Link href={`/${locale}/news/${featuredNews.slug}`}
                  className="block overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-400">
                  {featuredNews.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={featuredNews.cover_url} alt="" className="h-52 w-full object-cover" />
                  ) : null}
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-slate-900 wrap-anywhere">{pick(featuredNews.title_i18n, locale)}</h3>
                    {featuredNews.summary_i18n ? (
                      <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 wrap-anywhere">{pick(featuredNews.summary_i18n, locale)}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-400 tabular-nums">{featuredNews.published_at?.slice(0, 10)}</p>
                  </div>
                </Link>
              ) : null}
              {restNews.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {restNews.map((a) => (
                    <li key={a.id}>
                      <Link href={`/${locale}/news/${a.slug}`}
                        className="flex h-full gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-400">
                        {a.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.cover_url} alt="" className="h-16 w-20 shrink-0 rounded object-cover" />
                        ) : null}
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-medium text-slate-900 wrap-anywhere">{pick(a.title_i18n, locale)}</p>
                          <p className="mt-1 text-xs text-slate-400 tabular-nums">{a.published_at?.slice(0, 10)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {/* 오늘 이후 대회 */}
          {upcoming.length > 0 ? (
            <div className="space-y-2 pt-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold text-slate-900">{t('event.title')}</h2>
                <Link href={`/${locale}/events`} className="text-sm text-slate-500 hover:text-slate-900">{t('common.total')} →</Link>
              </div>
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                {upcoming.map((e) => (
                  <Link key={e.id} href={`/${locale}/events/${e.id}`}
                    className="w-56 shrink-0 snap-start rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-400">
                    {e.sport_name ? <Badge tone="blue">{pick(e.sport_name, locale)}</Badge> : null}
                    <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm font-medium text-slate-900 wrap-anywhere">{pick(e.name_i18n, locale)}</p>
                    <p className="mt-1 text-xs tabular-nums text-slate-500">{e.starts_on} ~ {e.ends_on}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* 사이드바 */}
        <aside className="space-y-5">
          {/* 순위 */}
          {ranking && ranking.entries.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-slate-900">{t('nav.rankings')}</h3>
                <Link href={`/${locale}/rankings`} className="text-xs text-slate-500 hover:text-slate-900">{t('common.total')} →</Link>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 truncate">{pick(ranking.board.name_i18n, locale)}</p>
              <ol className="mt-3 space-y-1.5">
                {ranking.entries.slice(0, 6).map((e) => {
                  const name = e.team_name ? pick(e.team_name, locale) : (e.label ?? '-');
                  const main = e.cells?.[e.cells.length - 1];
                  const row = (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-center font-mono text-slate-400">{e.rank}</span>
                      <span className="flex-1 truncate text-slate-800">{name}</span>
                      {main != null ? <span className="tabular-nums font-medium text-slate-600">{String(main)}</span> : null}
                    </span>
                  );
                  return (
                    <li key={`${e.rank}-${name}`}>
                      {e.person_id ? (
                        <Link href={`/${locale}/athletes/${e.person_id}`} className="block rounded px-1 py-0.5 hover:bg-slate-50">{row}</Link>
                      ) : (
                        <div className="px-1 py-0.5">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          {/* 후원 가능 선수 — 스폰서 전면 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-slate-900">{t('sponsor.title')}</h3>
              <Link href={`/${locale}/sponsorship`} className="text-xs text-slate-500 hover:text-slate-900">{t('common.total')} →</Link>
            </div>
            {sponsors.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">{t('sponsor.empty')}</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {sponsors.slice(0, 5).map((s) => (
                  <li key={s.person_id}>
                    <Link href={`/${locale}/athletes/${s.person_id}`}
                      className="flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-slate-50">
                      {s.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-400">
                          {(s.name_latin ?? s.full_name ?? '?').slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{s.name_latin ?? s.full_name}</span>
                        <span className="block truncate text-xs text-slate-500">{pick(s.headline_i18n, locale)}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">♥ {s.followers}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/${locale}/sponsorship`}
              className="mt-3 block rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-700">
              {t('sponsor.open')}
            </Link>
          </div>

          {/* 종목 */}
          {sports.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-slate-900">{t('sport.title')}</h3>
                <Link href={`/${locale}/sports`} className="text-xs text-slate-500 hover:text-slate-900">{t('common.total')} →</Link>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {sports.slice(0, 14).map((s) => (
                  <li key={s.id}>
                    <Link href={`/${locale}/${s.code.toLowerCase()}`}
                      className="inline-block rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 transition hover:border-slate-400 hover:text-slate-950">
                      {pick(s.name_i18n, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 공개정보 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">{t('nav.openinfo')}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href={`/${locale}/orgs`} className="text-slate-700 hover:text-slate-950">{t('nav.orgs')} →</Link></li>
              <li><Link href={`/${locale}/orgs/disclosure`} className="text-slate-700 hover:text-slate-950">{t('nav.disclosure')} →</Link></li>
              <li><Link href={`/${locale}/info/grants`} className="text-slate-700 hover:text-slate-950">{t('grant.title')} →</Link></li>
              <li><Link href={`/${locale}/info/stats`} className="text-slate-700 hover:text-slate-950">{t('nav.stats')} →</Link></li>
              <li><Link href={`/${locale}/verify`} className="text-slate-700 hover:text-slate-950">{t('nav.verify')} →</Link></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
