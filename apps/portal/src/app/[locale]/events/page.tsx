import Link from 'next/link';
import { listEvents, t as pick, formatDateRange } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Table, Tr, Td, Badge } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/**
 * 대회 일정 (공개).
 * 대한체육회처럼 주간·월간·연간 세 가지 보기를 제공한다.
 * 사용자가 찾는 시간 단위가 다르기 때문이다
 * (선수는 이번 주, 협회 담당자는 이번 달, 정부는 연간).
 */
const RANGES = { week: 7, month: 31, year: 365 } as const;
type RangeKey = keyof typeof RANGES;

export default async function EventSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { locale: raw } = await params;
  const { range } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const key: RangeKey = range === 'week' || range === 'year' ? range : 'month';
  const today = new Date();
  const until = new Date(today.getTime() + RANGES[key] * 86_400_000);
  const from = today.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);

  const events = await listEvents({ from, to: untilStr, limit: 300 }).catch(() => []);

  const tabs: Array<{ k: RangeKey; label: string }> = [
    { k: 'week', label: locale === 'ko' ? '주간' : locale === 'en' ? 'Week' : 'Tuần' },
    { k: 'month', label: locale === 'ko' ? '월간' : locale === 'en' ? 'Month' : 'Tháng' },
    { k: 'year', label: locale === 'ko' ? '연간' : locale === 'en' ? 'Year' : 'Năm' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.schedule')} subtitle={`${from} ~ ${untilStr}`} />

      <nav className="flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.k}
            href={`/${locale}/events?range=${tab.k}`}
            className={
              'rounded px-3 py-1.5 text-sm ' +
              (key === tab.k
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <EmptyState message={t('event.empty')} />
      ) : (
        <Table
          head={[t('event.name'), t('nav.sports'), t('event.period'), t('event.venue'), t('event.entries')]}
        >
          {events.map((e) => (
            <Tr key={e.id}>
              <Td className="wrap-anywhere">
                <Link
                  href={`/${locale}/events/${e.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {pick(e.name_i18n, locale)}
                </Link>
                {e.event_level ? (
                  <Badge>{e.event_level}</Badge>
                ) : null}
              </Td>
              <Td className="text-slate-600">{e.sport_name ? pick(e.sport_name, locale) : '-'}</Td>
              <Td className="whitespace-nowrap tabular-nums text-slate-600">
                {formatDateRange(e.starts_on, e.ends_on)}
              </Td>
              <Td className="text-slate-600">{e.venue_text ?? '-'}</Td>
              <Td className="tabular-nums">{e.entry_count}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
