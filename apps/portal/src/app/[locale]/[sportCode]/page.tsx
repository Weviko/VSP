import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getSport, getSportStats, listEvents, listAthleteRegistrations, subscriberCount, t as pick,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { StatCard, EmptyState, Table, Tr, Td, Badge } from '@vsp/web-shared/ui';

/**
 * 종목 허브.
 * 검색 유입의 핵심 페이지다. 종목명으로 검색한 사람이 도착하는 곳이라
 * 일정·선수·결과가 한 화면에 모여 있어야 한다.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; sportCode: string }>;
}) {
  const { locale: raw, sportCode } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  try {
    const sport = await getSport(sportCode.toUpperCase());
    if (sport) return { title: pick(sport.name_i18n, locale) };
  } catch {
    // 메타데이터 생성 실패가 페이지 렌더링을 막지 않게 한다
  }
  return {};
}

export default async function SportHub({
  params,
}: {
  params: Promise<{ locale: string; sportCode: string }>;
}) {
  const { locale: raw, sportCode } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const sport = await getSport(sportCode.toUpperCase());
  if (!sport) notFound();

  const [stats, events, athletes, followers] = await Promise.all([
    getSportStats(sport.id),
    listEvents({ sportId: sport.id, limit: 20 }),
    // 공개 규칙(미성년 보호 등)은 공개 뷰가 적용한다. 여기서 다시 거르지 않는다.
    listAthleteRegistrations({ sportId: sport.id, limit: 30 }),
    subscriberCount('SPORT', sport.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{pick(sport.name_i18n, locale)}</h1>
          {sport.is_olympic ? <Badge tone="blue">Olympic</Badge> : null}
          {sport.is_seagames ? <Badge>SEA Games</Badge> : null}
        </div>
        {followers > 0 ? (
          <p className="mt-1 text-sm tabular-nums text-slate-500">{t('my.subscriptions')} {followers}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('sport.athletes')} value={stats.athletes} />
        <StatCard label={t('sport.coaches')} value={stats.coaches} />
        <StatCard label={t('sport.referees')} value={stats.referees} />
        <StatCard label={t('sport.upcoming')} value={stats.upcoming_events} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('event.title')}</h2>
        {events.length === 0 ? (
          <EmptyState message={t('event.empty')} />
        ) : (
          <Table head={[t('event.name'), t('event.period'), t('event.venue'), t('event.entries')]}>
            {events.map((e) => (
              <Tr key={e.id}>
                <Td className="wrap-anywhere">
                  <Link
                    href={`/${locale}/events/${e.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {pick(e.name_i18n, locale)}
                  </Link>
                </Td>
                <Td className="tabular-nums whitespace-nowrap text-slate-600">
                  {e.starts_on} ~ {e.ends_on}
                </Td>
                <Td className="text-slate-600">{e.venue_text ?? '—'}</Td>
                <Td className="tabular-nums">{e.entry_count}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* ad slot: SPORT_SIDEBAR (비활성) */}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('sport.athletes')} ({athletes.length})
        </h2>
        {athletes.length === 0 ? (
          <EmptyState message={t('reg.empty')} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {athletes.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${locale}/athletes/${a.person_id}`}
                  className="block rounded border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-400"
                >
                  <p className="font-medium text-slate-900">{a.full_name}</p>
                  <p className="mt-0.5 text-sm text-slate-500 wrap-anywhere">
                    {pick(a.org_name, locale)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
