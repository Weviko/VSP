import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t as pick, listSeasons } from '@vsp/core-admin';
import { getNationalTeam, listCallups, type CallupType } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { createCallupForm } from '../actions';

export const dynamic = 'force-dynamic';

const CTYPES: CallupType[] = ['SELECTION', 'CAMP', 'COMPETITION_ENTRY'];
const CSTATUS_TONE: Record<string, 'blue' | 'amber' | 'green' | 'neutral'> = {
  PLANNED: 'neutral', OPEN: 'amber', FINALIZED: 'green', CANCELLED: 'neutral',
};
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function NationalTeamDetailPage({ params }: { params: Promise<{ locale: string; teamId: string }> }) {
  const { locale: raw, teamId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const team = await getNationalTeam(teamId).catch(() => null);
  if (!team) notFound();
  const [callups, seasons] = await Promise.all([
    listCallups({ nationalTeamId: teamId }).catch(() => []),
    listSeasons().catch(() => []),
  ]);
  const base = `/${locale}/admin/national-teams`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="text-sm text-[#15607A] hover:underline">← {t('nteam.teams')}</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={pick(team.name_i18n, locale)} />
        <Badge tone="neutral">{t(`nteam.age.${team.age_class}`)}</Badge>
        <Badge tone="neutral">{t(`nteam.gender.${team.gender}`)}</Badge>
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">{t('nav.sports')}</dt><dd className="text-slate-800">{pick(team.sport_name, locale)}</dd></div>
          <div><dt className="text-slate-500">{t('nteam.coach')}</dt><dd className="text-slate-800">{team.head_coach_name ?? '—'}</dd></div>
          <div><dt className="text-slate-500">{t('nteam.governingOrg')}</dt><dd className="text-slate-800 wrap-anywhere">{team.governing_org_name ? pick(team.governing_org_name, locale) : '—'}</dd></div>
        </dl>
      </Card>

      {/* 새 소집 */}
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('nteam.newCallup')}</summary>
          <form action={createCallupForm.bind(null, locale, team.id)} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nav.seasons')}</span>
                <select name="season_id" required defaultValue={seasons.find((s) => s.is_current)?.id ?? ''} className={input}>
                  <option value="" disabled>—</option>
                  {seasons.map((s) => <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nteam.callup')}</span>
                <select name="callup_type" defaultValue="COMPETITION_ENTRY" className={input}>
                  {CTYPES.map((c) => <option key={c} value={c}>{t(`nteam.ctype.${c}`)}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="mb-1 block text-sm text-slate-600">{t('nteam.competition')}</span>
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="competition_vi" placeholder="VI" className={input} />
                <input name="competition_en" placeholder="EN" className={input} />
                <input name="competition_ko" placeholder="KO" className={input} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nteam.quota')}</span>
                <input type="number" name="quota" min="1" className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nteam.venue')}</span>
                <input name="venue_text" className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nteam.period')}</span>
                <input type="date" name="starts_on" className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">&nbsp;</span>
                <input type="date" name="ends_on" className={input} />
              </label>
            </div>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('nteam.newCallup')}</button>
          </form>
        </details>
      </Card>

      {/* 소집 이력 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{t('nteam.callups')}</h2>
        {callups.length === 0 ? (
          <EmptyState message={t('nteam.noCallups')} />
        ) : (
          <Table head={[t('nteam.competition'), t('nteam.callup'), t('nteam.period'), t('nteam.quota'), t('integrity.status'), '']}>
            {callups.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link href={`${base}/callups/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {c.target_competition_name_i18n ? pick(c.target_competition_name_i18n, locale) : t(`nteam.ctype.${c.callup_type}`)}
                  </Link>
                </Td>
                <Td className="text-slate-600">{t(`nteam.ctype.${c.callup_type}`)}</Td>
                <Td className="tabular-nums text-slate-500">{c.starts_on?.slice(0, 10) ?? '—'}</Td>
                <Td className="tabular-nums text-slate-700">{c.confirmed_count}{c.quota != null ? `/${c.quota}` : ''}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Badge tone={c.approval_status === 'APPROVED' ? 'green' : 'amber'}>{t(`nteam.astatus.${c.approval_status}`)}</Badge>
                    <Badge tone={CSTATUS_TONE[c.status] ?? 'neutral'}>{t(`nteam.cstatus.${c.status}`)}</Badge>
                  </div>
                </Td>
                <Td><Link href={`${base}/callups/${c.id}`} className="text-sm text-[#15607A] hover:underline">→</Link></Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
