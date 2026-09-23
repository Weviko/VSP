import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t as pick } from '@vsp/core-admin';
import { getCallup, listSquad, type SquadRole, type MemberStatus } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState, ExportButton } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import {
  approveCallupForm, nominateMemberForm, setMemberStatusForm, finalizeSquadForm, searchPersonsAction,
} from '../../actions';

export const dynamic = 'force-dynamic';

const ROLES: SquadRole[] = ['ATHLETE', 'RESERVE', 'COACH', 'MANAGER', 'MEDICAL'];
const NEXT_STATUS: MemberStatus[] = ['NOMINATED', 'SELECTED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN'];
const MSTATUS_TONE: Record<string, 'blue' | 'amber' | 'green' | 'red' | 'neutral'> = {
  NOMINATED: 'amber', SELECTED: 'blue', CONFIRMED: 'green', DECLINED: 'red', WITHDRAWN: 'red', REPLACED: 'neutral',
};
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function CallupDetailPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; callupId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { locale: raw, callupId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const sp = await searchParams;

  const callup = await getCallup(callupId).catch(() => null);
  if (!callup) notFound();
  const squad = await listSquad(callupId).catch(() => []);

  const base = `/${locale}/admin/national-teams`;
  const pickerLabels = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const isApproved = callup.approval_status === 'APPROVED';
  const isOpen = callup.status === 'PLANNED' || callup.status === 'OPEN';
  const title = callup.target_competition_name_i18n ? pick(callup.target_competition_name_i18n, locale) : t(`nteam.ctype.${callup.callup_type}`);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/${callup.national_team_id}`} className="text-sm text-[#15607A] hover:underline">← {pick(callup.team_name, locale)}</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={title} />
        <Badge tone={isApproved ? 'green' : 'amber'}>{t(`nteam.astatus.${callup.approval_status}`)}</Badge>
        <Badge tone={callup.status === 'FINALIZED' ? 'green' : 'neutral'}>{t(`nteam.cstatus.${callup.status}`)}</Badge>
        <span className="text-sm tabular-nums text-slate-500">
          {t('nteam.confirmedOfQuota', { n: callup.confirmed_count, q: callup.quota ?? '∞' })}
        </span>
      </div>

      {sp.err === 'quota' ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{t('nteam.quotaExceeded')}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* 명단 */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">{t('nteam.squad')}</h2>
              <div className="flex items-center gap-2">
                {callup.confirmed_count > 0 ? (
                  <ExportButton kind="national-team-entry" label={t('nteam.exportEntry')} params={{ callup: callup.id, locale }} />
                ) : null}
                {isApproved && callup.status !== 'FINALIZED' ? (
                  <form action={finalizeSquadForm.bind(null, locale, callup.id)}>
                    <button className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">{t('nteam.finalize')}</button>
                  </form>
                ) : null}
              </div>
            </div>
            {squad.length === 0 ? (
              <EmptyState message={t('common.noData')} />
            ) : (
              <Table head={[t('person.name'), t('nteam.role.ATHLETE'), t('nteam.eligibility'), t('integrity.status'), '']}>
                {squad.map((m) => {
                  const el = m.eligibility_check;
                  return (
                    <Tr key={m.id}>
                      <Td className="font-medium text-slate-900 wrap-anywhere">
                        {m.full_name}
                        {m.verify_code ? <span className="ml-1.5 font-mono text-[11px] text-slate-400" title={t('coach.verifyCode')}>{m.verify_code}</span> : null}
                      </Td>
                      <Td><Badge tone="neutral">{t(`nteam.role.${m.squad_role}`)}</Badge></Td>
                      <Td>
                        {el == null ? <span className="text-slate-400">—</span> : el.eligible ? (
                          <Badge tone="green">{t('nteam.eligible')}</Badge>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <Badge tone="red">{t('nteam.ineligible')}</Badge>
                            <span className="text-[11px] text-red-700">{el.reasons.map((r) => t(`nteam.reason.${r}`)).join(', ')}</span>
                          </div>
                        )}
                      </Td>
                      <Td><Badge tone={MSTATUS_TONE[m.member_status] ?? 'neutral'}>{t(`nteam.mstatus.${m.member_status}`)}</Badge></Td>
                      <Td>
                        {callup.status !== 'FINALIZED' ? (
                          <form action={setMemberStatusForm.bind(null, locale, callup.id)} className="flex items-center gap-1">
                            <input type="hidden" name="member_id" value={m.id} />
                            <select name="status" defaultValue={m.member_status} className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                              {NEXT_STATUS.map((s) => <option key={s} value={s}>{t(`nteam.mstatus.${s}`)}</option>)}
                            </select>
                            <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">{t('common.save')}</button>
                          </form>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
              </Table>
            )}
          </section>
        </div>

        {/* 우: 처리 도구 */}
        <div className="space-y-4">
          {!isApproved ? (
            <Card>
              <form action={approveCallupForm.bind(null, locale, callup.id)} className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t('nteam.approve')}</p>
                <input name="decision_no" placeholder={t('nteam.decisionNo')} className={input} />
                <button className="w-full rounded bg-[#15607A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0e4356]">{t('nteam.approve')}</button>
              </form>
            </Card>
          ) : null}

          {isOpen ? (
            <Card>
              <form action={nominateMemberForm.bind(null, locale, callup.id)} className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t('nteam.nominate')}</p>
                <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pickerLabels} />
                <select name="squad_role" defaultValue="ATHLETE" className={input}>
                  {ROLES.map((r) => <option key={r} value={r}>{t(`nteam.role.${r}`)}</option>)}
                </select>
                <button className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('nteam.addMember')}</button>
              </form>
            </Card>
          ) : null}

          <Card>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{t('nteam.callup')}</dt><dd className="text-slate-800">{t(`nteam.ctype.${callup.callup_type}`)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t('nav.seasons')}</dt><dd className="text-slate-800">{callup.season_name ? pick(callup.season_name, locale) : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t('nteam.venue')}</dt><dd className="text-slate-800 wrap-anywhere">{callup.venue_text ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t('nteam.period')}</dt><dd className="tabular-nums text-slate-700">{callup.starts_on?.slice(0, 10) ?? '—'}{callup.ends_on ? ` ~ ${callup.ends_on.slice(0, 10)}` : ''}</dd></div>
              {callup.decision_no ? <div className="flex justify-between"><dt className="text-slate-500">{t('nteam.decisionNo')}</dt><dd className="text-slate-700">{callup.decision_no}</dd></div> : null}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
