import Link from 'next/link';
import { listRelay, listVideos, t as pick, type UUID } from '@vsp/core-admin';
import { getEvent, listMatches } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import {
  recordResultForm, addRelayForm, deleteRelayForm, addVideoForm, setVideoStatusForm, deleteVideoForm,
} from './actions';

const RESULT_OUTCOMES = ['', 'WIN', 'LOSS', 'DRAW'];

export const dynamic = 'force-dynamic';

const RELAY_KINDS = ['INFO', 'GOAL', 'PERIOD', 'CARD', 'SUB'];

/**
 * 경기 콘텐츠 작성 — 문자중계·영상 (협회 담당자용).
 *
 * 서버 렌더 + 서버 액션 폼만으로 동작한다(클라이언트 JS 불필요). 공개 노출은 pub 뷰가 다시 거른다.
 */
export default async function MatchContentPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string; matchId: string }>;
}) {
  const { locale: raw, eventId, matchId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [event, matches, relay, videos] = await Promise.all([
    getEvent(eventId as UUID),
    listMatches(eventId as UUID),
    listRelay(matchId as UUID),
    listVideos({ matchId: matchId as UUID }),
  ]);
  const match = matches.find((m) => m.id === matchId);

  if (!event || !match) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('event.matches')} />
        <EmptyState message={t('common.noData')} />
        <Link href={`/${locale}/admin/events/${eventId}`} className="text-sm text-sky-700 hover:underline">← {t('event.detail')}</Link>
      </div>
    );
  }

  const a = match.participants.find((p) => ['A', 'HOME'].includes(p.side ?? ''));
  const b = match.participants.find((p) => ['B', 'AWAY'].includes(p.side ?? ''));
  const bind = (fn: (l: string, e: string, m: string, fd: FormData) => Promise<void>) => fn.bind(null, locale, eventId, matchId);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href={`/${locale}/admin/events/${eventId}`} className="text-sm text-sky-700 hover:underline">← {pick(event.name_i18n, locale)}</Link>
      </div>

      <PageHeader
        title={`${a?.label ?? '(A)'} vs ${b?.label ?? '(B)'}`}
        subtitle={`${match.round_name ?? ''}${match.match_no ? ` · ${match.match_no}` : ''}`}
        right={<Badge tone={statusTone(match.status)}>{match.status}</Badge>}
      />

      {/* ── 결과·점수 입력 ── */}
      <section id="result" className="space-y-4 scroll-mt-20">
        <h2 className="text-lg font-semibold text-slate-900">{t('match.result')}</h2>
        <Card>
          {match.participants.length === 0 ? (
            <EmptyState message={t('common.noData')} />
          ) : (
            <form action={bind(recordResultForm)} className="space-y-3">
              <input type="hidden" name="entry_ids" value={match.participants.map((p) => p.entry_id).filter(Boolean).join(',')} />
              {match.participants.map((p) => (
                <div key={p.entry_id ?? p.side} className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem] sm:items-end">
                  <span className="text-sm font-medium text-slate-800 wrap-anywhere">
                    {p.side ? <span className="mr-1 font-mono text-xs text-slate-400">{p.side}</span> : null}
                    {p.label ?? '—'}
                  </span>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">{t('match.score')}</span>
                    <input name={`score_${p.entry_id}`} type="number" defaultValue={p.score ?? ''} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">{t('match.outcome')}</span>
                    <select name={`result_${p.entry_id}`} defaultValue={p.result ?? ''} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                      {RESULT_OUTCOMES.map((o) => <option key={o} value={o}>{o ? t(`match.${o.toLowerCase()}`) : '—'}</option>)}
                    </select>
                  </label>
                </div>
              ))}
              <button className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('match.saveResult')}</button>
            </form>
          )}
        </Card>
      </section>

      {/* ── 문자중계 ── */}
      <section id="relay" className="space-y-4 scroll-mt-20">
        <h2 className="text-lg font-semibold text-slate-900">{t('match.relay')}</h2>

        <Card>
          <form action={bind(addRelayForm)} className="grid gap-3 sm:grid-cols-[6rem_5rem_7rem_1fr_auto] sm:items-end">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.clock')}</span>
              <input name="clock" placeholder="45'+2" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.side')}</span>
              <select name="side" defaultValue="" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value="">—</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.kind')}</span>
              <select name="kind" defaultValue="INFO" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                {RELAY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.text')}</span>
              <input name="text" required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('common.add')}</button>
          </form>
        </Card>

        {relay.length === 0 ? (
          <EmptyState message={t('match.noRelay')} />
        ) : (
          <ol className="space-y-2">
            {[...relay].reverse().map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded border border-slate-200 bg-white px-3 py-2">
                <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-slate-500">{r.clock ?? '·'}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{r.kind}</span>
                {r.side ? <span className="text-xs font-mono text-slate-400">{r.side}</span> : null}
                <span className="min-w-0 flex-1 text-sm text-slate-800 wrap-anywhere">{pick(r.text_i18n, locale)}</span>
                <form action={bind(deleteRelayForm)}>
                  <input type="hidden" name="relay_id" value={r.id} />
                  <button className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600" title={t('common.delete')}>×</button>
                </form>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── 영상 ── */}
      <section id="video" className="space-y-4 scroll-mt-20">
        <h2 className="text-lg font-semibold text-slate-900">{t('event.video')}</h2>

        <Card>
          <form action={bind(addVideoForm)} className="space-y-3">
            <input type="hidden" name="sport_id" value={event.sport_id ?? ''} />
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.videoTitle')}</span>
              <input name="title" required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr_6rem]">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('content.provider')}</span>
                <select name="provider" defaultValue="YOUTUBE" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                  <option value="YOUTUBE">YouTube</option>
                  <option value="URL">URL</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('content.videoRef')}</span>
                <input name="external_id" placeholder="YouTube ID" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="url" placeholder="https://…" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('content.duration')}</span>
                <input name="duration" type="number" min="0" placeholder="초" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
            </div>
            <p className="text-xs text-slate-500">{t('content.videoHint')}</p>
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('common.add')}</button>
          </form>
        </Card>

        {videos.length === 0 ? (
          <EmptyState message={t('match.noVideo')} />
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded border border-slate-200 bg-white px-3 py-2">
                <Badge tone={statusTone(v.status)}>{t(`status.${v.status}`)}</Badge>
                <span className="min-w-0 flex-1 text-sm text-slate-800 wrap-anywhere">
                  {pick(v.title_i18n, locale)}
                  <span className="ml-2 font-mono text-xs text-slate-400">{v.provider}:{v.external_id ?? v.url}</span>
                </span>
                {v.status !== 'PUBLISHED' ? (
                  <form action={bind(setVideoStatusForm)}>
                    <input type="hidden" name="video_id" value={v.id} />
                    <input type="hidden" name="status" value="PUBLISHED" />
                    <button className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50">{t('content.publish')}</button>
                  </form>
                ) : (
                  <form action={bind(setVideoStatusForm)}>
                    <input type="hidden" name="video_id" value={v.id} />
                    <input type="hidden" name="status" value="HIDDEN" />
                    <button className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">{t('content.hide')}</button>
                  </form>
                )}
                <form action={bind(deleteVideoForm)}>
                  <input type="hidden" name="video_id" value={v.id} />
                  <button className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600" title={t('common.delete')}>×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
