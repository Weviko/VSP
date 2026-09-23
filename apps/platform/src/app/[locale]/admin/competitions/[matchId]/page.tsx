import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t as pick } from '@vsp/core-admin';
import {
  getMatchLive, listMatchOfficials, listRefereeCandidates, listMatchEvents,
  type OfficialRole, type MatchEventKind,
} from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import {
  assignOfficialForm, setOfficialStatusForm, removeOfficialForm,
  appendEventForm, setLiveForm, finalizeMatchForm,
} from '../actions';

export const dynamic = 'force-dynamic';

const ROLES: OfficialRole[] = ['CHIEF_REFEREE', 'REFEREE', 'JUDGE', 'SCORER', 'TIMEKEEPER', 'COMMISSIONER'];
const KINDS: MatchEventKind[] = ['FOUL', 'CARD', 'SUB', 'TIMEOUT', 'PERIOD_START', 'PERIOD_END', 'NOTE'];
const M_TONE: Record<string, 'blue' | 'green' | 'neutral' | 'amber'> = { LIVE: 'blue', FINISHED: 'green', SCHEDULED: 'amber', CANCELLED: 'neutral' };
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function MatchOpsPage({ params }: { params: Promise<{ locale: string; matchId: string }> }) {
  const { locale: raw, matchId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const match = await getMatchLive(matchId).catch(() => null);
  if (!match) notFound();
  const [officials, candidates, events] = await Promise.all([
    listMatchOfficials(matchId).catch(() => []),
    listRefereeCandidates(null).catch(() => []),
    listMatchEvents(matchId).catch(() => []),
  ]);
  const scores = match.live_state?.scores ?? {};
  const base = `/${locale}/admin/competitions`;
  const live = match.status === 'LIVE';
  const finished = match.status === 'FINISHED';

  return (
    <div className="space-y-6">
      <div><Link href={base} className="text-sm text-[#15607A] hover:underline">← {t('ops.title')}</Link></div>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={[match.round_name, match.match_no].filter(Boolean).join(' · ') || t('ops.match')} />
        <Badge tone={M_TONE[match.status] ?? 'neutral'}>{t(`ops.mstatus.${match.status}`)}</Badge>
      </div>

      {/* 스코어보드 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {match.sides.map((s) => (
          <Card key={s.side ?? s.label} className="text-center">
            <p className="text-sm font-medium text-slate-600 wrap-anywhere">{s.label ?? s.side}</p>
            <p className="my-1 text-4xl font-bold tabular-nums text-slate-900">{s.side ? (scores[s.side] ?? Number(s.score ?? 0)) : '—'}</p>
            {!finished && s.side ? (
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3].map((pts) => (
                  <form key={pts} action={appendEventForm.bind(null, locale, match.id)}>
                    <input type="hidden" name="kind" value="SCORE" />
                    <input type="hidden" name="side" value={s.side ?? ''} />
                    <input type="hidden" name="points" value={pts} />
                    <button className="rounded bg-[#15607A] px-3 py-1 text-sm font-semibold text-white hover:bg-[#0e4356]">+{pts}</button>
                  </form>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 실시간 기록 */}
        <div className="space-y-4 lg:col-span-2">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{t('ops.liveConsole')}</h2>
              <div className="flex gap-2">
                {!live && !finished ? (
                  <form action={setLiveForm.bind(null, locale, match.id)}>
                    <button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">{t('ops.setLive')}</button>
                  </form>
                ) : null}
                {!finished ? (
                  <form action={finalizeMatchForm.bind(null, locale, match.id)}>
                    <button className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">{t('ops.finalize')}</button>
                  </form>
                ) : null}
              </div>
            </div>
            {!finished ? (
              <Card>
                <form action={appendEventForm.bind(null, locale, match.id)} className="flex flex-wrap items-end gap-2">
                  <select name="kind" defaultValue="FOUL" className={input + ' w-auto'}>
                    {KINDS.map((k) => <option key={k} value={k}>{t(`ops.kind.${k}`)}</option>)}
                  </select>
                  <select name="side" defaultValue="" className={input + ' w-auto'}>
                    <option value="">—</option>
                    {match.sides.map((s) => <option key={s.side ?? ''} value={s.side ?? ''}>{s.label ?? s.side}</option>)}
                  </select>
                  <input name="note" placeholder={t('ops.note')} className={input + ' w-40'} />
                  <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('ops.addEvent')}</button>
                </form>
              </Card>
            ) : null}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">{t('ops.events')}</h2>
            {events.length === 0 ? (
              <EmptyState message={t('ops.noEvents')} />
            ) : (
              <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                    <Badge tone={e.kind === 'SCORE' ? 'blue' : e.kind === 'CARD' || e.kind === 'FOUL' ? 'amber' : 'neutral'}>{t(`ops.kind.${e.kind}`)}</Badge>
                    {e.side ? <span className="font-medium text-slate-700">{e.side}</span> : null}
                    {e.points ? <span className="tabular-nums text-slate-600">+{String(e.points).replace(/\.0+$/, '')}</span> : null}
                    {e.note ? <span className="text-slate-500 wrap-anywhere">{e.note}</span> : null}
                    <span className="ml-auto shrink-0 tabular-nums text-xs text-slate-400">{e.occurred_at?.slice(11, 16)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* 심판 배정 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">{t('ops.officials')}</h2>
          <Card>
            <form action={assignOfficialForm.bind(null, locale, match.id)} className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">{t('ops.assignOfficial')}</p>
              {candidates.length === 0 ? (
                <p className="text-xs text-slate-400">{t('ops.empty')}</p>
              ) : (
                <select name="person_id" required defaultValue="" className={input}>
                  <option value="" disabled>{t('ops.referee')}</option>
                  {candidates.map((c) => (
                    <option key={c.registration_id} value={`${c.person_id}__${c.registration_id}`}>
                      {c.full_name}{c.license_grade ? ` (${c.license_grade})` : ''}
                    </option>
                  ))}
                </select>
              )}
              <select name="role" defaultValue="REFEREE" className={input}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`ops.role.${r}`)}</option>)}
              </select>
              <button className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700" disabled={candidates.length === 0}>{t('ops.assignOfficial')}</button>
            </form>
          </Card>
          {officials.length === 0 ? (
            <EmptyState message={t('ops.noOfficials')} />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
              {officials.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="wrap-anywhere">
                    <span className="font-medium text-slate-800">{o.full_name}</span>
                    <span className="ml-1.5 text-xs text-slate-500">{t(`ops.role.${o.role}`)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge tone={o.status === 'CONFIRMED' ? 'green' : o.status === 'DECLINED' ? 'red' : 'amber'}>{t(`ops.ostatus.${o.status}`)}</Badge>
                    {o.status === 'ASSIGNED' ? (
                      <form action={setOfficialStatusForm.bind(null, locale, match.id)}>
                        <input type="hidden" name="official_id" value={o.id} />
                        <input type="hidden" name="status" value="CONFIRMED" />
                        <button className="rounded border border-emerald-200 px-1.5 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50">✓</button>
                      </form>
                    ) : null}
                    <form action={removeOfficialForm.bind(null, locale, match.id)}>
                      <input type="hidden" name="official_id" value={o.id} />
                      <button className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100">×</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
