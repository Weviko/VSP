import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEvent, listEntries, listMatches, listAvailableFormats } from '@vsp/sport-domain';
import { t as pick, formatScore } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { EventAdmin } from './EventAdmin';
import { updateEventForm } from '../actions';
import { requireWorkspace } from '@/lib/session';

const EVENT_LEVELS = ['NATIONAL', 'PROVINCIAL', 'CLUB', 'INTERNATIONAL'];
const EVENT_TYPES = ['CHAMPIONSHIP', 'LEAGUE', 'FESTIVAL', 'TRAINING'];

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: raw, eventId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const event = await getEvent(eventId);
  if (!event) notFound();

  const [entries, matches] = await Promise.all([listEntries(eventId), listMatches(eventId)]);
  const formats = listAvailableFormats();

  return (
    <div className="space-y-6">
      <PageHeader
        title={pick(event.name_i18n, locale)}
        subtitle={`${event.starts_on} ~ ${event.ends_on}${event.venue_text ? ' · ' + event.venue_text : ''}`}
        right={
          <>
            <Badge tone={statusTone(event.approval_status)}>
              {t('event.approval')}: {t(`status.${event.approval_status}`)}
            </Badge>
            <Badge tone={statusTone(event.status)}>{event.status}</Badge>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">{t('nav.sports')}</p>
          <p className="mt-1 text-sm">{event.sport_name ? pick(event.sport_name, locale) : '—'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('event.host')}</p>
          <p className="mt-1 text-sm wrap-anywhere">{pick(event.host_name, locale)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('event.entries')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{entries.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('event.decisionNo')}</p>
          <p className="mt-1 font-mono text-sm">{event.decision_no ?? '—'}</p>
        </Card>
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-sky-700">{t('common.edit')}</summary>
          <form action={updateEventForm.bind(null, locale, eventId)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm lg:col-span-3">
              <span className="mb-1 block text-slate-600">{t('event.name')} (VI)</span>
              <input name="name_vi" required defaultValue={(event.name_i18n as Record<string, string>).vi ?? ''} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('event.name')} (EN)</span>
              <input name="name_en" defaultValue={(event.name_i18n as Record<string, string>).en ?? ''} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('event.name')} (KO)</span>
              <input name="name_ko" defaultValue={(event.name_i18n as Record<string, string>).ko ?? ''} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('event.venue')}</span>
              <input name="venue_text" defaultValue={event.venue_text ?? ''} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('event.level')}</span>
              <select name="event_level" defaultValue={event.event_level ?? ''} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value="">—</option>
                {EVENT_LEVELS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('event.type')}</span>
              <select name="event_type" defaultValue={event.event_type ?? ''} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value="">—</option>
                {EVENT_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('season.starts')}</span>
              <input name="starts_on" type="date" defaultValue={event.starts_on} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('season.ends')}</span>
              <input name="ends_on" type="date" defaultValue={event.ends_on} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="lg:col-span-3">
              <button className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
            </div>
          </form>
        </details>
      </Card>

      <EventAdmin
        eventId={eventId}
        locale={locale}
        approvalStatus={event.approval_status}
        formats={formats}
        labels={{
          approve: t('common.approve'),
          decisionNo: t('event.decisionNo'),
          generateDraw: t('event.generateDraw'),
          format: t('event.format'),
          addEntry: t('event.entries'),
          name: t('person.name'),
          save: t('common.save'),
        }}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('event.entries')} ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={['#', t('person.name'), t('org.name'), 'Seed', t('common.status')]}>
            {entries.map((e, i) => (
              <Tr key={e.id}>
                <Td className="tabular-nums text-slate-400">{i + 1}</Td>
                <Td className="font-medium text-slate-900">{e.person_name ?? '—'}</Td>
                <Td className="text-slate-600">{e.org_name ? pick(e.org_name, locale) : '—'}</Td>
                <Td className="tabular-nums">{e.seed_no ?? '—'}</Td>
                <Td>
                  <Badge tone={statusTone(e.status)}>{t(`status.${e.status}`)}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('event.matches')} ({matches.length})
        </h2>
        {matches.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('event.round'), t('event.matchNo'), 'A', 'B', t('common.status'), '']}>
            {matches.map((m) => (
              <Tr key={m.id}>
                <Td className="text-slate-600">{m.round_name ?? '—'}</Td>
                <Td className="font-mono text-xs text-slate-500">{m.match_no ?? '—'}</Td>
                {['A', 'HOME'].some((s) => m.participants.some((p) => p.side === s)) ? (
                  <>
                    <Td>{participantCell(m.participants, ['A', 'HOME'])}</Td>
                    <Td>{participantCell(m.participants, ['B', 'AWAY'])}</Td>
                  </>
                ) : (
                  <>
                    <Td className="text-slate-400">—</Td>
                    <Td className="text-slate-400">—</Td>
                  </>
                )}
                <Td>
                  <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                </Td>
                <Td>
                  <Link
                    href={`/${locale}/admin/events/${eventId}/matches/${m.id}`}
                    className="text-sm font-medium text-sky-700 hover:underline"
                  >
                    {t('content.manage')}
                  </Link>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}

function participantCell(
  participants: Array<{ side: string | null; label: string | null; score: string | null }>,
  sides: string[]
) {
  const p = participants.find((x) => x.side && sides.includes(x.side));
  if (!p) return <span className="text-slate-400">—</span>;
  return (
    <span>
      <span className="text-slate-900">{p.label ?? '(TBD)'}</span>
      {p.score != null ? (
        <span className="ml-2 font-mono text-sm text-slate-600">{formatScore(p.score)}</span>
      ) : null}
    </span>
  );
}
