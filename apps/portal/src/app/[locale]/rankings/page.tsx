import Link from 'next/link';
import {
  listSports, listStandingBoards, getStandings, t as pick, type UUID,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Table, Tr, Td, Badge } from '@vsp/web-shared/ui';

/**
 * 순위 (네이버 종목 안 '순위' 탭). 종목마다 순위판이 여럿이다(팀순위·타자기록·투수기록…).
 *   종목 선택 → 리그 필터 → 순위판 탭 → 표.
 * 순위판 컬럼·행은 종목별로 다르므로 데이터(columns/cells)를 그대로 표로 그린다.
 * 선수 순위의 미성년 이름은 공개 뷰에서 이미 머리글자로 마스킹된다.
 */
export const dynamic = 'force-dynamic';

export default async function RankingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sport?: string; league?: string; board?: string }>;
}) {
  const { locale: raw } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const base = `/${locale}/rankings`;

  const sports = await listSports().catch(() => []);
  const sportId = (sp.sport as UUID) || null;

  // 종목 선택 줄
  const sportBar = (
    <nav className="flex flex-wrap gap-2">
      {sports.map((s) => (
        <Link
          key={s.id}
          href={`${base}?sport=${s.id}`}
          className={
            'rounded-full px-3 py-1 text-sm ' +
            (sportId === s.id ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
          }
        >
          {pick(s.name_i18n, locale)}
        </Link>
      ))}
    </nav>
  );

  if (!sportId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.rankings')} subtitle={t('sport.title')} />
        {sportBar}
        <EmptyState message={t('sport.title')} />
      </div>
    );
  }

  const boards = await listStandingBoards({ sportId }).catch(() => []);
  if (boards.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.rankings')} />
        {sportBar}
        <EmptyState message={t('common.noData')} />
      </div>
    );
  }

  // 리그 필터 (해당 종목 순위판에 실제로 있는 리그만)
  const leagues = [...new Set(boards.map((b) => b.league).filter((l): l is string => Boolean(l)))];
  const league = sp.league && leagues.includes(sp.league) ? sp.league : null;
  const shown = league ? boards.filter((b) => b.league === league) : boards;

  // 선택된 순위판 (없으면 첫 번째)
  const board = shown.find((b) => b.id === sp.board) ?? shown[0];
  const data = board ? await getStandings(board.id).catch(() => null) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.rankings')} />
      {sportBar}

      {leagues.length > 0 ? (
        <nav className="flex flex-wrap gap-2">
          <Link
            href={`${base}?sport=${sportId}`}
            className={'rounded px-2.5 py-1 text-sm ' + (!league ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100')}
          >
            {t('search.all')}
          </Link>
          {leagues.map((lg) => (
            <Link
              key={lg}
              href={`${base}?sport=${sportId}&league=${encodeURIComponent(lg)}`}
              className={'rounded px-2.5 py-1 text-sm ' + (league === lg ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100')}
            >
              {lg}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* 순위판 탭 (팀순위·타자기록·…) */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {shown.map((b) => {
          const href = `${base}?sport=${sportId}${league ? `&league=${encodeURIComponent(league)}` : ''}&board=${b.id}`;
          const on = board?.id === b.id;
          return (
            <Link
              key={b.id}
              href={href}
              className={'px-3 py-2 text-sm ' + (on ? 'border-b-2 border-slate-900 font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-800')}
            >
              {pick(b.name_i18n, locale)}
            </Link>
          );
        })}
      </nav>

      {!data || data.entries.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {board?.season_name ? <Badge tone="blue">{pick(board.season_name, locale)}</Badge> : null}
            {board?.league ? <Badge>{board.league}</Badge> : null}
            <span className="tabular-nums">~ {data.board.computed_on}</span>
          </div>
          <Table head={['#', t('org.name'), ...data.board.columns]}>
            {data.entries.map((e, i) => (
              <Tr key={i}>
                <Td className="tabular-nums font-medium">{e.rank}</Td>
                <Td className="font-medium text-slate-900 wrap-anywhere">
                  {e.person_id ? (
                    <Link href={`/${locale}/athletes/${e.person_id}`} className="hover:underline">
                      {e.label ?? '-'}
                    </Link>
                  ) : e.team_name ? (
                    pick(e.team_name, locale)
                  ) : (
                    e.label ?? '-'
                  )}
                </Td>
                {data.board.columns.map((_, ci) => (
                  <Td key={ci} className="text-center font-mono tabular-nums">
                    {e.cells[ci] != null ? String(e.cells[ci]) : '-'}
                  </Td>
                ))}
              </Tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
