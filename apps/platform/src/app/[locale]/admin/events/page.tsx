import Link from 'next/link';
import { listEvents } from '@vsp/sport-domain';
import { t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, ButtonLink, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function EventsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let events = null;
  let error: string | undefined;
  try {
    events = await listEvents({ limit: 200 });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('event.title')}
        right={
          <>
            {events ? (
              <span className="text-sm text-slate-500">
                {t('common.total')}: <strong className="tabular-nums">{events.length}</strong>
              </span>
            ) : null}
            <ButtonLink href={`/${locale}/admin/events/new`}>{t('event.create')}</ButtonLink>
          </>
        }
      />

      {!events ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : events.length === 0 ? (
        <EmptyState message={t('event.empty')} />
      ) : (
        <Table
          head={[
            t('event.name'), t('nav.sports'), t('event.period'),
            t('event.host'), t('event.entries'), t('event.approval'), t('common.status'),
          ]}
        >
          {events.map((e) => (
            <Tr key={e.id}>
              <Td className="wrap-anywhere">
                <Link
                  href={`/${locale}/admin/events/${e.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {pick(e.name_i18n, locale)}
                </Link>
                {e.is_ranked ? (
                  <span className="ml-2 text-xs text-slate-400">{t('event.ranked')}</span>
                ) : null}
              </Td>
              <Td className="text-slate-600">{e.sport_name ? pick(e.sport_name, locale) : '—'}</Td>
              <Td className="tabular-nums whitespace-nowrap text-slate-600">
                {e.starts_on} ~ {e.ends_on}
              </Td>
              <Td className="text-slate-600 wrap-anywhere">{pick(e.host_name, locale)}</Td>
              <Td className="tabular-nums">{e.entry_count}</Td>
              <Td>
                <Badge tone={statusTone(e.approval_status)}>
                  {t(`status.${e.approval_status}`)}
                </Badge>
              </Td>
              <Td>
                <Badge tone={statusTone(e.status)}>{e.status}</Badge>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
