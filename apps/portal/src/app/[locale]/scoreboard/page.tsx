import Link from 'next/link';
import {
  listScoreboard, listSports, formatScore, t as pick, type UUID, type ScoreCard,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Badge } from '@vsp/web-shared/ui';

/**
 * 오늘의 경기 (네이버 스포츠 "오늘의 경기").
 *
 * 여러 대회의 경기를 날짜로 모아 카드로 보여준다. 상태에 따라 버튼이 달라진다:
 *   예정 → 응원, 진행 → 중계, 종료 → 기록  (네이버 실사, 문서 14 §5-B)
 * 데이터는 공개 뷰(pub)만 읽는다.
 */
export const dynamic = 'force-dynamic';

const STATE: Record<string, { key: 'scheduled' | 'ongoing' | 'finished'; tone: 'blue' | 'red' | 'neutral'; action: 'cheer' | 'live' | 'record' }> = {
  SCHEDULED: { key: 'scheduled', tone: 'blue', action: 'cheer' },
  LIVE: { key: 'ongoing', tone: 'red', action: 'live' },
  FINISHED: { key: 'finished', tone: 'neutral', action: 'record' },
};

export default async function ScoreboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sport?: string }>;
}) {
  const { locale: raw } = await params;
  const { sport } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const [sports, cards] = await Promise.all([
    listSports().catch(() => []),
    listScoreboard({ sportId: (sport as UUID) || null, limit: 200 }).catch(() => []),
  ]);

  // 날짜별로 묶는다 (최신 날짜 먼저)
  const byDate = new Map<string, ScoreCard[]>();
  for (const c of cards) {
    if (!byDate.has(c.on_date)) byDate.set(c.on_date, []);
    byDate.get(c.on_date)!.push(c);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('score.title')} subtitle={cards.length ? `${cards.length}` : undefined} />

      {/* 종목 필터 */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href={`/${locale}/scoreboard`}
          className={
            'rounded-full px-3 py-1 text-sm ' +
            (!sport ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
          }
        >
          {t('search.all')}
        </Link>
        {sports.map((s) => (
          <Link
            key={s.id}
            href={`/${locale}/scoreboard?sport=${s.id}`}
            className={
              'rounded-full px-3 py-1 text-sm ' +
              (sport === s.id ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
            }
          >
            {pick(s.name_i18n, locale)}
          </Link>
        ))}
      </nav>

      {cards.length === 0 ? (
        <EmptyState message={t('score.empty')} />
      ) : (
        <div className="space-y-8">
          {[...byDate.entries()].map(([date, list]) => (
            <section key={date} className="space-y-3">
              <h2 className="text-sm font-semibold tabular-nums text-slate-500">{date}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const st = STATE[c.status] ?? STATE.SCHEDULED;
                  const a = c.sides.find((x) => x.side && ['A', 'HOME'].includes(x.side)) ?? c.sides[0];
                  const b = c.sides.find((x) => x.side && ['B', 'AWAY'].includes(x.side)) ?? c.sides[1];
                  return (
                    <li key={c.match_id}>
                      <Link
                        href={`/${locale}/matches/${c.match_id}`}
                        className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-slate-500">
                            {c.sport_name ? pick(c.sport_name, locale) : ''}
                            {c.round_name ? ` · ${c.round_name}` : ''}
                          </span>
                          <Badge tone={st.tone}>{t(`score.${st.action}`)}</Badge>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          <MatchSide label={a?.label} score={a?.score} win={a?.result === 'WIN'} />
                          <MatchSide label={b?.label} score={b?.score} win={b?.result === 'WIN'} />
                        </div>
                        <p className="mt-3 truncate text-xs text-slate-400">{pick(c.event_name, locale)}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchSide({ label, score, win }: { label: string | null | undefined; score: string | null | undefined; win: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={'truncate text-sm ' + (win ? 'font-bold text-slate-900' : 'text-slate-700')}>
        {label ?? '(TBD)'}
      </span>
      <span className={'shrink-0 font-mono tabular-nums ' + (win ? 'font-bold text-slate-900' : 'text-slate-600')}>
        {score != null ? formatScore(score) : '-'}
      </span>
    </div>
  );
}
