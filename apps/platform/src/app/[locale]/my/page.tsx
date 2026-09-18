import Link from 'next/link';
import {
  canUseWorkspace, listPaymentOrders, listSubmissionsBy, formatVND, t as pick,
} from '@vsp/core-admin';
import { listRegistrations, listPersonResults, listSports, REG_TYPE_LABELS } from '@vsp/sport-domain';
import { listSubscriptions, getSponsorshipProfile, listProposalsForAthlete } from '@vsp/core-admin';
import { subscribeForm, unsubscribeForm, setSponsorshipForm, respondProposalForm } from './actions';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState, Table, Tr, Td, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireMember } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 내 생애주기.
 *
 * 한국 스포츠지원포털의 '내 생애주기'(신청이력·활동이력)를 한 화면으로 옮겼다.
 * 한 사람이 선수에서 지도자, 심판으로 옮겨가도 기록이 한 곳에 쌓인다.
 *
 * 모든 조회는 로그인한 본인의 personId 로만 한다. 주소나 입력값으로 다른 사람을 지정할 방법이 없다.
 */
export default async function MyRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sponsorErr?: string }>;
}) {
  const { locale: raw } = await params;
  const { sponsorErr } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const user = await requireMember(locale);

  if (!user.personId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('my.title')} />
        <EmptyState message={t('my.noPerson')} />
      </div>
    );
  }

  const [regs, results, submissions, payments, subs, allSports, sponsorProfile, proposals] =
    await Promise.all([
      listRegistrations({ personId: user.personId, limit: 50 }),
      listPersonResults(user.personId, 50),
      listSubmissionsBy(user.personId, 50),
      listPaymentOrders({ payerPersonId: user.personId, limit: 50 }),
      listSubscriptions(user.personId),
      listSports({ onlyActive: true }),
      getSponsorshipProfile(user.personId),
      listProposalsForAthlete(user.personId),
    ]);
  const subscribedSportIds = new Set(subs.filter((x) => x.target_type === 'SPORT').map((x) => x.target_id));
  const subscribable = allSports.filter((s) => !subscribedSportIds.has(s.id));

  // 후원 프로필은 승인된 선수만 켤 수 있다 — 아니면 항목을 감춘다(가드는 서버에도 있다).
  const isAthlete = regs.some((r) => r.reg_type === 'ATHLETE' && r.status === 'APPROVED');
  const sponsorErrMsg =
    sponsorErr === 'MINOR' ? t('sponsor.errMinor') :
    sponsorErr === 'NO_ATHLETE' ? t('sponsor.errNoAthlete') : null;
  const currentHeadline = sponsorProfile?.headline_i18n
    ? pick(sponsorProfile.headline_i18n, locale)
    : '';

  return (
    <div className="space-y-8">
      <PageHeader title={user.fullName ?? t('my.title')} subtitle={t('my.subtitle')} />

      {canUseWorkspace(user) ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">{t('my.workspaceHint')}</p>
          <Link
            href={`/${locale}/admin`}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t('my.goWork')}
          </Link>
        </Card>
      ) : null}

      {/* 관심 종목 (MY팀 구독) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('my.subscriptions')}</h2>
        <form action={subscribeForm.bind(null, locale)} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="target_type" value="SPORT" />
          <select
            name="target_id"
            defaultValue=""
            required
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>{t('my.pickSport')}</option>
            {subscribable.map((s) => (
              <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>
            ))}
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {t('my.subscribe')}
          </button>
        </form>
        {subs.length === 0 ? (
          <EmptyState message={t('my.subEmpty')} />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1">
                <span className="text-sm text-slate-800">{s.target_name ? pick(s.target_name, locale) : s.target_type}</span>
                <form action={unsubscribeForm.bind(null, locale)}>
                  <input type="hidden" name="target_type" value={s.target_type} />
                  <input type="hidden" name="target_id" value={s.target_id} />
                  <button
                    className="rounded-full px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title={t('my.unsubscribe')}
                    aria-label={t('my.unsubscribe')}
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 후원 프로필 (문서 06) — 승인된 선수만. 플랫폼은 연결만, 자금은 경유하지 않는다. */}
      {isAthlete ? (
        <section id="sponsor" className="space-y-4 scroll-mt-20">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('sponsor.profile')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('sponsor.notePlatform')}</p>
          </div>

          {sponsorErrMsg ? (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {sponsorErrMsg}
            </div>
          ) : null}

          <Card>
            <form action={setSponsorshipForm.bind(null, locale)} className="space-y-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="is_open"
                  defaultChecked={sponsorProfile?.is_open ?? false}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{t('sponsor.openLabel')}</span>
                  <span className="block text-xs text-slate-500">{t('sponsor.openHint')}</span>
                </span>
              </label>
              <div>
                <label className="block text-sm text-slate-700">{t('sponsor.headline')}</label>
                <input
                  type="text"
                  name="headline"
                  defaultValue={currentHeadline}
                  maxLength={120}
                  placeholder={t('sponsor.headlinePh')}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
                {t('common.save')}
              </button>
            </form>
          </Card>

          <h3 className="text-sm font-semibold text-slate-700">{t('sponsor.received')}</h3>
          {proposals.length === 0 ? (
            <EmptyState message={t('sponsor.none')} />
          ) : (
            <ul className="space-y-3">
              {proposals.map((p) => (
                <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{p.sponsor_name}</span>
                    <Badge tone={statusTone(p.status)}>{t(`status.${p.status}`)}</Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                    {p.budget ? (
                      <div className="flex gap-2"><dt className="text-slate-400">{t('sponsor.budget')}</dt><dd>{p.budget}</dd></div>
                    ) : null}
                    {p.sponsor_contact ? (
                      <div className="flex gap-2"><dt className="text-slate-400">{t('sponsor.contact')}</dt><dd>{p.sponsor_contact}</dd></div>
                    ) : null}
                  </dl>
                  {p.message ? <p className="mt-2 text-sm text-slate-700">{p.message}</p> : null}
                  {p.status === 'SENT' || p.status === 'VIEWED' ? (
                    <div className="mt-3 flex gap-2">
                      <form action={respondProposalForm.bind(null, locale)}>
                        <input type="hidden" name="proposal_id" value={p.id} />
                        <input type="hidden" name="decision" value="ACCEPTED" />
                        <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                          {t('sponsor.accept')}
                        </button>
                      </form>
                      <form action={respondProposalForm.bind(null, locale)}>
                        <input type="hidden" name="proposal_id" value={p.id} />
                        <input type="hidden" name="decision" value="DECLINED" />
                        <button className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                          {t('sponsor.decline')}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('my.registrations')}</h2>
          <Link href={`/${locale}/my/registrations/new`} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('my.applyRegistration')}</Link>
        </div>
        {regs.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('nav.sports'), t('nav.registrations'), t('org.name'), t('common.status')]}>
            {regs.map((r) => (
              <Tr key={r.id}>
                <Td>{pick(r.sport_name, locale)}</Td>
                <Td>{pick(REG_TYPE_LABELS[r.reg_type] ?? { vi: r.reg_type }, locale)}</Td>
                <Td className="text-slate-600">{pick(r.org_name, locale)}</Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>{t(`status.${r.status}`)}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('my.submissions')}</h2>
        {submissions.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('common.createdAt'), t('nav.documents'), t('common.status')]}>
            {submissions.map((s) => (
              <Tr key={s.id}>
                <Td className="whitespace-nowrap tabular-nums text-slate-600">
                  {(s.submitted_at ?? s.created_at).slice(0, 10)}
                </Td>
                <Td>{pick(s.form_title, locale)}</Td>
                <Td>
                  <Badge tone={statusTone(s.status)}>{t(`status.${s.status}`)}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('my.results')}</h2>
        {results.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('event.name'), t('event.rank'), t('event.medal')]}>
            {results.map((r) => (
              <Tr key={r.id}>
                <Td>{pick((r as unknown as { event_name: Record<string, string> }).event_name, locale)}</Td>
                <Td className="tabular-nums">{r.final_rank ?? '—'}</Td>
                <Td>{r.medal ? <Badge tone="amber">{r.medal}</Badge> : '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('my.payments')}</h2>
        {payments.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('nav.payments'), t('org.name'), t('common.total'), t('common.status')]}>
            {payments.map((p) => (
              <Tr key={p.id}>
                <Td className="font-mono text-xs">{p.order_no}</Td>
                <Td className="text-slate-600">{pick(p.payee_name, locale)}</Td>
                <Td className="tabular-nums">{formatVND(p.amount)}</Td>
                <Td>
                  <Badge tone={statusTone(p.status)}>{t(`status.${p.status}`)}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
