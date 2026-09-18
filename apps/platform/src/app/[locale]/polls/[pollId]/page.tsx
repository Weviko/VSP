import Link from 'next/link';
import { getPoll, myVote, hasCheered, t as pick, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState, Badge } from '@vsp/web-shared/ui';
import { requireMember } from '@/lib/session';
import { voteForm, cheerForm } from './actions';

export const dynamic = 'force-dynamic';

/** 회원 투표·응원 (공개 웹의 "투표하기" 링크가 여기로 온다). */
export default async function PollVotePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; pollId: string }>;
  searchParams: Promise<{ voted?: string; err?: string }>;
}) {
  const { locale: raw, pollId } = await params;
  const { voted, err } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const user = await requireMember(locale);

  const poll = await getPoll(pollId as UUID);
  if (!poll) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title={t('nav.polls')} />
        <EmptyState message={t('common.noData')} />
      </div>
    );
  }

  const mine = user.accountId ? await myVote(pollId as UUID, user.accountId) : null;
  const open = poll.status === 'OPEN';
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const cheered = poll.event_id && user.accountId ? await hasCheered('EVENT', poll.event_id, user.accountId) : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={pick(poll.title_i18n, locale)}
        subtitle={`${total} ${t('poll.votes')}`}
        right={<Badge tone={open ? 'blue' : 'neutral'}>{t(open ? 'poll.open' : 'poll.closed')}</Badge>}
      />

      {voted ? <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{t('poll.thanks')}</div> : null}
      {err ? <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{t('poll.notOpen')}</div> : null}

      <Card>
        <ul className="space-y-2">
          {poll.options.map((o) => {
            const pct = total ? Math.round((o.votes / total) * 100) : 0;
            const chosen = mine === o.id;
            return (
              <li key={o.id}>
                <form action={voteForm.bind(null, locale, pollId)} className="flex items-center gap-3">
                  <input type="hidden" name="option_id" value={o.id} />
                  <button
                    disabled={!open}
                    className={
                      'relative w-full overflow-hidden rounded border px-3 py-2 text-left text-sm disabled:cursor-default ' +
                      (chosen ? 'border-slate-900 font-semibold' : 'border-slate-300 hover:bg-slate-50')
                    }
                  >
                    <span className="absolute inset-y-0 left-0 bg-sky-100" style={{ width: `${pct}%` }} aria-hidden />
                    <span className="relative flex justify-between">
                      <span>{o.label_i18n ? pick(o.label_i18n, locale) : '—'}{chosen ? ' ✓' : ''}</span>
                      <span className="tabular-nums text-slate-500">{o.votes} · {pct}%</span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
        {!open ? <p className="mt-3 text-xs text-slate-500">{t('poll.closedNote')}</p> : null}
      </Card>

      {poll.event_id ? (
        <form action={cheerForm.bind(null, locale, pollId)} className="flex items-center gap-3">
          <input type="hidden" name="target_type" value="EVENT" />
          <input type="hidden" name="target_id" value={poll.event_id} />
          <button className={'rounded-full border px-4 py-1.5 text-sm font-medium ' + (cheered ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-700 hover:bg-slate-100')}>
            {cheered ? '♥' : '♡'} {t('poll.cheer')}
          </button>
        </form>
      ) : null}

      <Link href={`/${locale}/my`} className="text-sm text-slate-500 hover:underline">← {t('my.title')}</Link>
    </div>
  );
}
