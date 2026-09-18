import { listPolls, getPoll, t as pick, type UUID } from '@vsp/core-admin';
import { listEvents } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, EmptyState, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireWorkspace, currentUser } from '@/lib/session';
import { createPollForm, addOptionForm, setPollStatusForm, deleteOptionForm } from './actions';

export const dynamic = 'force-dynamic';

/** 팬 투표 관리 — 생성, 선택지 추가, 열기/닫기. 실제 투표는 회원이 공개 링크로 한다. */
export default async function PollsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { dbError } = await currentUser();

  if (dbError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t('nav.polls')}</h1>
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const [polls, events] = await Promise.all([listPolls(), listEvents({ limit: 50 })]);
  const detailed = await Promise.all(polls.map((p) => getPoll(p.id)));

  return (
    <div className="space-y-8">
      <PageHeader title={t('nav.polls')} subtitle={t('poll.subtitle')} />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('poll.new')}</h2>
        <form action={createPollForm.bind(null, locale)} className="flex flex-wrap items-end gap-2">
          <input name="title" required placeholder={t('poll.question')} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
          <select name="event_id" defaultValue="" className="rounded border border-slate-300 bg-white px-2 py-2 text-sm">
            <option value="">{t('poll.noEvent')}</option>
            {events.map((e) => <option key={e.id} value={e.id}>{pick(e.name_i18n, locale)}</option>)}
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.add')}</button>
        </form>
      </Card>

      {detailed.length === 0 ? (
        <EmptyState message={t('poll.empty')} />
      ) : (
        <ul className="space-y-4">
          {detailed.map((p) => p && (
            <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{pick(p.title_i18n, locale)}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(p.status)}>{t(`status.${p.status}`)}</Badge>
                  {(['DRAFT', 'OPEN', 'CLOSED'] as const).filter((s) => s !== p.status).map((s) => (
                    <form key={s} action={setPollStatusForm.bind(null, locale)} className="inline">
                      <input type="hidden" name="poll_id" value={p.id} />
                      <input type="hidden" name="status" value={s} />
                      <button className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">{t(`poll.set${s}`)}</button>
                    </form>
                  ))}
                </div>
              </div>

              <ul className="mt-3 space-y-1">
                {p.options.length === 0 ? (
                  <li className="text-sm text-slate-400">{t('poll.noOptions')}</li>
                ) : p.options.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">{o.label_i18n ? pick(o.label_i18n, locale) : (o.person_id ?? o.team_id ?? '—')}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-slate-500">{o.votes} {t('poll.votes')}</span>
                      {p.status === 'DRAFT' ? (
                        <form action={deleteOptionForm.bind(null, locale)}>
                          <input type="hidden" name="option_id" value={o.id} />
                          <button className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600" title={t('common.delete')}>×</button>
                        </form>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              <form action={addOptionForm.bind(null, locale)} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="poll_id" value={p.id} />
                <input name="label" required placeholder={t('poll.optionLabel')} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">{t('poll.addOption')}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
