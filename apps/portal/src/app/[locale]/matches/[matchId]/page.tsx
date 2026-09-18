import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMatch, listMatchRelay, listNews, listVideos, listOpenPolls, cheerCount, formatScore, t as pick,
  type BoxScore, type PublicMatchDetail, type RelayItem, type NewsItem, type VideoItem, type PollPublic,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { EmptyState, Badge, Table, Tr, Td } from '@vsp/web-shared/ui';

/**
 * 경기 상세 (네이버 경기 상세, 문서 14 §5-B).
 *
 * 상태와 무관하게 탭 구성은 같다: 기록·라인업·응원·중계·뉴스·영상.
 * 탭은 URL 쿼리(?tab=)로 두어 서버 렌더링을 유지한다(클라이언트 JS 불필요).
 * 종목별 기록표(box_score)는 columns/rows 가 있으면 표로, 없으면 참가자 점수만 보여준다.
 * 응원 탭은 대회 응원 수 + 열린 팬 투표(MVP)를 보여주고, 실제 참여는 로그인 플랫폼으로 보낸다.
 */
export const dynamic = 'force-dynamic';

type Tab = 'record' | 'lineup' | 'cheer' | 'relay' | 'news' | 'video';
const TABS: Tab[] = ['record', 'lineup', 'cheer', 'relay', 'news', 'video'];
const TAB_LABEL: Record<Tab, string> = {
  record: 'score.record', lineup: 'match.lineup', cheer: 'score.cheer',
  relay: 'match.relay', news: 'nav.news', video: 'event.video',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; matchId: string }> }) {
  const { locale: raw, matchId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const m = await getMatch(matchId).catch(() => null);
  return m ? { title: pick(m.event_name, locale) } : {};
}

export default async function MatchDetail({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; matchId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale: raw, matchId } = await params;
  const { tab: tabRaw } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const m = await getMatch(matchId);
  if (!m) notFound();

  const tab: Tab = TABS.includes(tabRaw as Tab) ? (tabRaw as Tab) : 'record';

  // 활성 탭의 콘텐츠만 조회한다 (서버 렌더, 필요한 것만).
  const [relay, news, videos, polls, cheers] = await Promise.all([
    tab === 'relay' ? listMatchRelay(m.id).catch(() => []) : Promise.resolve([] as RelayItem[]),
    tab === 'news' ? listNews({ eventId: m.event_id, limit: 20 }).catch(() => []) : Promise.resolve([] as NewsItem[]),
    tab === 'video' ? listVideos({ matchId: m.id, limit: 12 }).catch(() => []) : Promise.resolve([] as VideoItem[]),
    tab === 'cheer' ? listOpenPolls({ eventId: m.event_id }).catch(() => []) : Promise.resolve([] as PollPublic[]),
    tab === 'cheer' ? cheerCount('EVENT', m.event_id).catch(() => 0) : Promise.resolve(0),
  ]);
  const platformUrl = process.env.VSP_PLATFORM_URL ?? 'http://localhost:3001';
  const a = m.sides.find((s) => s.side && ['A', 'HOME'].includes(s.side)) ?? m.sides[0];
  const b = m.sides.find((s) => s.side && ['B', 'AWAY'].includes(s.side)) ?? m.sides[1];
  const stateTone = m.status === 'LIVE' ? 'red' : m.status === 'FINISHED' ? 'neutral' : 'blue';
  const stateKey = m.status === 'LIVE' ? 'ongoing' : m.status === 'FINISHED' ? 'finished' : 'scheduled';

  return (
    <div className="space-y-6">
      {/* 점수 헤더 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
          <Link href={`/${locale}/events/${m.event_id}`} className="truncate hover:text-slate-900">
            {pick(m.event_name, locale)}
            {m.round_name ? ` · ${m.round_name}` : ''}
          </Link>
          <Badge tone={stateTone}>{t(`score.${stateKey}`)}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <MatchTeam label={a?.label} win={a?.result === 'WIN'} align="right" />
          <div className="text-center font-mono text-2xl font-bold tabular-nums text-slate-900">
            {a?.score != null || b?.score != null
              ? `${a?.score != null ? formatScore(a.score) : '-'} : ${b?.score != null ? formatScore(b.score) : '-'}`
              : t('match.vs')}
          </div>
          <MatchTeam label={b?.label} win={b?.result === 'WIN'} align="left" />
        </div>
        {m.venue_text ? <p className="mt-3 text-center text-sm text-slate-500">{m.venue_text}</p> : null}
      </div>

      {/* 탭 */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/${locale}/matches/${m.id}?tab=${x}`}
            className={
              'px-3 py-2 text-sm ' +
              (tab === x
                ? 'border-b-2 border-slate-900 font-semibold text-slate-900'
                : 'text-slate-500 hover:text-slate-800')
            }
          >
            {t(TAB_LABEL[x])}
          </Link>
        ))}
      </nav>

      {tab === 'record' ? <RecordTab box={m.box_score} sides={m.sides} t={t} /> : null}
      {tab === 'lineup' ? <LineupTab sides={m.sides} t={t} /> : null}
      {tab === 'relay' ? <RelayTab items={relay} locale={locale} t={t} /> : null}
      {tab === 'news' ? <NewsTab items={news} locale={locale} t={t} /> : null}
      {tab === 'video' ? <VideoTab items={videos} locale={locale} t={t} /> : null}
      {tab === 'cheer' ? (
        <CheerTab polls={polls} cheers={cheers} eventId={m.event_id} platformUrl={platformUrl} locale={locale} t={t} />
      ) : null}
    </div>
  );
}

type Sides = PublicMatchDetail['sides'];

function MatchTeam({ label, win, align }: { label: string | null | undefined; win: boolean; align: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <span className={'text-lg wrap-anywhere ' + (win ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
        {label ?? '(TBD)'}
      </span>
    </div>
  );
}

function RecordTab({
  box,
  sides,
  t,
}: {
  box: BoxScore;
  sides: Sides;
  t: (k: string) => string;
}) {
  const hasTable = Array.isArray(box.columns) && Array.isArray(box.rows) && box.rows.length > 0;
  if (hasTable) {
    return (
      <Table head={['', ...box.columns!]}>
        {box.rows!.map((r, i) => (
          <Tr key={i}>
            <Td className="font-medium text-slate-900">{r.label ?? r.side}</Td>
            {r.cells.map((c, j) => (
              <Td key={j} className="text-center font-mono tabular-nums">{String(c)}</Td>
            ))}
          </Tr>
        ))}
      </Table>
    );
  }
  // 기록표가 없으면 참가자 점수만
  return (
    <Table head={['', t('match.boxscore')]}>
      {sides.map((s, i) => (
        <Tr key={i}>
          <Td className="font-medium text-slate-900">{s.label ?? s.side ?? '-'}</Td>
          <Td className="text-center font-mono tabular-nums">{s.score != null ? formatScore(s.score) : '-'}</Td>
        </Tr>
      ))}
    </Table>
  );
}

function LineupTab({ sides, t }: { sides: Sides; t: (k: string) => string }) {
  if (sides.length === 0) return <EmptyState message={t('common.noData')} />;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {sides.map((s, i) => (
        <li key={i} className="rounded border border-slate-200 bg-white px-4 py-3">
          <span className="text-xs font-mono text-slate-400">{s.side ?? '-'}</span>
          <p className="font-medium text-slate-900 wrap-anywhere">{s.label ?? '(TBD)'}</p>
        </li>
      ))}
    </ul>
  );
}

/** 응원: 대회 응원 수 + 열린 팬 투표(MVP) 결과. 실제 응원·투표는 로그인 플랫폼에서. */
function CheerTab({
  polls, cheers, platformUrl, locale, t,
}: {
  polls: PollPublic[]; cheers: number; eventId: string; platformUrl: string; locale: Locale; t: (k: string) => string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-4xl">♥</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{cheers.toLocaleString()}</p>
        <p className="text-sm text-slate-500">{t('poll.cheerCount')}</p>
        <a href={`${platformUrl}/${locale}/login`} className="mt-3 rounded-full border border-rose-300 bg-rose-50 px-4 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100">
          ♡ {t('poll.cheer')}
        </a>
      </div>
      <div className="space-y-3">
        {polls.length === 0 ? (
          <EmptyState message={t('match.noPoll')} />
        ) : (
          polls.map((poll) => {
            const total = poll.total_votes || poll.options.reduce((s, o) => s + o.votes, 0);
            return (
              <div key={poll.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 wrap-anywhere">{pick(poll.title_i18n, locale)}</h3>
                  <Badge tone="blue">{t('poll.open')}</Badge>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {poll.options.map((o) => {
                    const pct = total ? Math.round((o.votes / total) * 100) : 0;
                    return (
                      <li key={o.id} className="relative overflow-hidden rounded border border-slate-200 px-3 py-1.5 text-sm">
                        <span className="absolute inset-y-0 left-0 bg-sky-100" style={{ width: `${pct}%` }} aria-hidden />
                        <span className="relative flex justify-between">
                          <span className="text-slate-800">{o.label ?? '—'}</span>
                          <span className="tabular-nums text-slate-500">{pct}%</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <a href={`${platformUrl}/${locale}/polls/${poll.id}`} className="mt-3 inline-block rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                  {t('poll.vote')}
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** 문자중계: 시간순 타임라인. 중요한 순간(득점 등)은 강조한다. */
function RelayTab({ items, locale, t }: { items: RelayItem[]; locale: Locale; t: (k: string) => string }) {
  if (items.length === 0) return <EmptyState message={t('match.noRelay')} />;
  return (
    <ol className="space-y-2">
      {items.map((r) => {
        const strong = r.kind === 'GOAL' || r.kind === 'PERIOD';
        return (
          <li
            key={r.id}
            className={
              'flex gap-3 rounded border px-4 py-3 ' +
              (strong ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white')
            }
          >
            <span className="w-14 shrink-0 font-mono text-sm tabular-nums text-slate-500">{r.clock ?? '·'}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {r.side ? <span className="text-xs font-mono text-slate-400">{r.side}</span> : null}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{r.kind}</span>
              </div>
              <p className={'mt-0.5 wrap-anywhere ' + (strong ? 'font-semibold text-slate-900' : 'text-slate-700')}>
                {pick(r.text_i18n, locale)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 뉴스: 이 경기(대회)와 관련된 기사 목록. */
function NewsTab({ items, locale, t }: { items: NewsItem[]; locale: Locale; t: (k: string) => string }) {
  if (items.length === 0) return <EmptyState message={t('match.noNews')} />;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((n) => (
        <li key={n.id}>
          <Link href={`/${locale}/news/${n.slug}`} className="flex gap-4 p-4 hover:bg-slate-50">
            {n.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.cover_url} alt="" className="h-16 w-24 shrink-0 rounded object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="font-medium text-slate-900 wrap-anywhere">{pick(n.title_i18n, locale)}</p>
              {n.summary_i18n ? (
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{pick(n.summary_i18n, locale)}</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-400">
                {n.byline_i18n ? pick(n.byline_i18n, locale) : t(`news.source.${n.source}`)}
                {n.published_at ? ` · ${n.published_at.slice(0, 10)}` : ''}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 영상: 썸네일 카드(임베드 플레이어는 IT팀이 붙인다 — 여기서는 링크·썸네일만). */
function VideoTab({ items, locale, t }: { items: VideoItem[]; locale: Locale; t: (k: string) => string }) {
  if (items.length === 0) return <EmptyState message={t('match.noVideo')} />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((v) => {
        const href =
          v.provider === 'YOUTUBE' && v.external_id
            ? `https://www.youtube.com/watch?v=${v.external_id}`
            : v.url ?? undefined;
        const thumb =
          v.thumbnail_url ??
          (v.provider === 'YOUTUBE' && v.external_id
            ? `https://i.ytimg.com/vi/${v.external_id}/hqdefault.jpg`
            : null);
        return (
          <a
            key={v.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="relative aspect-video bg-slate-100">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center text-3xl text-white/90 drop-shadow">▶</span>
              {v.duration_seconds ? (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[11px] font-mono text-white tabular-nums">
                  {Math.floor(v.duration_seconds / 60)}:{String(v.duration_seconds % 60).padStart(2, '0')}
                </span>
              ) : null}
            </div>
            <p className="p-3 text-sm font-medium text-slate-800 group-hover:text-slate-900 wrap-anywhere">
              {pick(v.title_i18n, locale)}
            </p>
          </a>
        );
      })}
    </div>
  );
}

