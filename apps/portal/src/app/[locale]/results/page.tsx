import Link from 'next/link';
import { listEvents, t as pick, formatDateRange } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Table, Tr, Td } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/** 종료된 대회 결과 모음 */
export default async function ResultsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const finished = await listEvents({ finishedOnly: true, limit: 300 }).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.results')} subtitle={`${finished.length}`} />
      {finished.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <Table head={[t('event.name'), t('nav.sports'), t('event.period'), t('event.host')]}>
          {finished.map((e) => (
            <Tr key={e.id}>
              <Td className="wrap-anywhere">
                <Link
                  href={`/${locale}/events/${e.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {pick(e.name_i18n, locale)}
                </Link>
              </Td>
              <Td className="text-slate-600">{e.sport_name ? pick(e.sport_name, locale) : '-'}</Td>
              <Td className="whitespace-nowrap tabular-nums text-slate-600">
                {formatDateRange(e.starts_on, e.ends_on)}
              </Td>
              <Td className="text-slate-600 wrap-anywhere">{pick(e.host_name, locale)}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
