import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getEvent, listEntries, listMatches, listEventResults, listOpenPolls, cheerCount, t as pick, formatScore,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Card, EmptyState, Table, Tr, Td, Badge, statusTone } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: raw, eventId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  try {
    const ev = await getEvent(eventId);
    if (ev) return { title: pick(ev.name_i18n, locale) };
  } catch {
    // 메타데이터 실패가 렌더링을 막지 않게 한다
  }
  return {};
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: raw, eventId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const event = await getEvent(eventId);
  // 승인되지 않았거나 비공개인 대회는 공개 뷰에 아예 없다
  if (!event) notFound();

  const [entries, matches, results, polls, cheers] = await Promise.all([
    listEntries(event.id),
    listMatches(event.id),
    listEventResults(event.id),
    listOpenPolls({ eventId: event.id }).catch(() => []),
    cheerCount('EVENT', event.id).catch(() => 0),
  ]);
  const platformUrl = process.env.VSP_PLATFORM_URL ?? 'http://localhost:3001';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 wrap-anywhere">
          {pick(event.name_i18n, locale)}
        </h1>
        <p className="mt-2 text-slate-600 tabular-nums">
          {event.starts_on} ~ {event.ends_on}
          {event.venue_text ? ` · ${event.venue_text}` : ''}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {event.sport_name ? (
            <Link
              href={`/${locale}/${(event.sport_code ?? '').toLowerCase()}`}
              className="hover:underline"
            >
              {pick(event.sport_name, locale)}
            </Link>
          ) : null}
          {' · '}
          {pick(event.host_name, locale)}
        </p>
      </div>

      {/* 팬 참여 — 투표 결과(읽기 전용) + 응원 수. 실제 투표·응원은 로그인 플랫폼에서. */}
      {polls.length > 0 || cheers > 0 ? (
        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          {polls.length > 0 ? (
            <div className="space-y-3">
              {polls.map((poll) => {
                const total = poll.total_votes || poll.options.reduce((s, o) => s + o.votes, 0);
                return (
                  <Card key={poll.id}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-slate-900">{pick(poll.title_i18n, locale)}</h2>
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
                  </Card>
                );
              })}
            </div>
          ) : null}
          <Card className="flex flex-col items-center justify-center text-center">
            <p className="text-3xl">♥</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{cheers.toLocaleString()}</p>
            <p className="text-sm text-slate-500">{t('poll.cheerCount')}</p>
            <a href={`${platformUrl}/${locale}/login`} className="mt-3 text-sm text-sky-700 hover:underline">{t('poll.cheer')} →</a>
          </Card>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('event.results')}</h2>
          <Table head={[t('event.rank'), t('person.name'), t('org.name'), t('event.medal')]}>
            {results.map((r) => (
              <Tr key={r.id}>
                <Td className="tabular-nums font-medium">{r.final_rank ?? '—'}</Td>
                <Td>
                  {r.person_id ? (
                    <Link
                      href={`/${locale}/athletes/${r.person_id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {r.label}
                    </Link>
                  ) : (
                    r.label ?? '—'
                  )}
                </Td>
                <Td className="text-slate-600">{r.org_name ? pick(r.org_name, locale) : '—'}</Td>
                <Td>{r.medal ? <Badge tone="amber">{r.medal}</Badge> : '—'}</Td>
              </Tr>
            ))}
          </Table>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('event.matches')} ({matches.length})
        </h2>
        {matches.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <div className="space-y-4">
            {[...new Map(matches.map((m) => [m.round_name ?? '', m])).keys()].map((round) => {
              const inRound = matches.filter((m) => (m.round_name ?? '') === round);
              return (
                <div key={round}>
                  {round ? <h3 className="mb-1.5 text-sm font-semibold text-slate-500">{round}</h3> : null}
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {inRound.map((m) => {
                      const a = m.participants.find((p) => p.side && ['A', 'HOME'].includes(p.side));
                      const b = m.participants.find((p) => p.side && ['B', 'AWAY'].includes(p.side));
                      const aw = a?.result === 'WIN'; const bw = b?.result === 'WIN';
                      return (
                        <li key={m.id}>
                          <Link href={`/${locale}/matches/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                            <span className={'flex-1 text-right text-sm wrap-anywhere ' + (aw ? 'font-bold text-slate-900' : 'text-slate-700')}>{a?.label ?? '(TBD)'}</span>
                            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-center font-mono text-sm tabular-nums text-slate-800">
                              {a?.score != null || b?.score != null ? `${a?.score != null ? formatScore(a.score) : '-'} : ${b?.score != null ? formatScore(b.score) : '-'}` : t('match.vs')}
                            </span>
                            <span className={'flex-1 text-sm wrap-anywhere ' + (bw ? 'font-bold text-slate-900' : 'text-slate-700')}>{b?.label ?? '(TBD)'}</span>
                            <Badge tone={statusTone(m.status)}>{t(`status.${m.status}`)}</Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('event.entries')} ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded border border-slate-200 bg-white px-4 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">{e.label ?? '—'}</span>
                {e.org_name ? (
                  <span className="ml-2 text-slate-500">{pick(e.org_name, locale)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
