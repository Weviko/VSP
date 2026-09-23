import Link from 'next/link';
import { t as pick } from '@vsp/core-admin';
import { listNationalTeams, listSports, type Gender, type AgeClass } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import { OrgPicker } from '@/components/OrgPicker';
import { createNationalTeamForm, searchPersonsAction, searchOrgsAction } from './actions';

export const dynamic = 'force-dynamic';

const GENDERS: Gender[] = ['MIXED', 'M', 'F'];
const AGES: AgeClass[] = ['SENIOR', 'U23', 'U20', 'YOUTH'];
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function NationalTeamsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [teams, sports] = await Promise.all([
    listNationalTeams({}).catch(() => []),
    listSports({ onlyActive: true }).catch(() => []),
  ]);
  const pickerLabels = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const base = `/${locale}/admin/national-teams`;

  return (
    <div className="space-y-6">
      <PageHeader title={t('nteam.teams')} />

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('nteam.newTeam')}</summary>
          <form action={createNationalTeamForm.bind(null, locale)} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nav.sports')}</span>
                <select name="sport_id" required defaultValue="" className={input}>
                  <option value="" disabled>—</option>
                  {sports.map((s) => <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('nteam.age.SENIOR')}/{t('nteam.age.U23')}</span>
                  <select name="age_class" defaultValue="SENIOR" className={input}>
                    {AGES.map((a) => <option key={a} value={a}>{t(`nteam.age.${a}`)}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('nteam.gender.MIXED')}</span>
                  <select name="gender" defaultValue="MIXED" className={input}>
                    {GENDERS.map((g) => <option key={g} value={g}>{t(`nteam.gender.${g}`)}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="name_vi" placeholder="Tên (VI)" className={input} />
              <input name="name_en" placeholder="Name (EN)" className={input} />
              <input name="name_ko" placeholder="이름 (KO)" className={input} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-1 block text-slate-600">{t('nteam.governingOrg')}</span>
                <OrgPicker name="governing_org_id" onSearch={searchOrgsAction.bind(null, locale)} labels={pickerLabels} />
              </div>
              <div className="text-sm">
                <span className="mb-1 block text-slate-600">{t('nteam.coach')}</span>
                <PersonPicker name="head_coach_person_id" onSearch={searchPersonsAction.bind(null, locale)} labels={pickerLabels} />
              </div>
            </div>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('nteam.newTeam')}</button>
          </form>
        </details>
      </Card>

      {teams.length === 0 ? (
        <EmptyState message={t('nteam.noTeams')} />
      ) : (
        <Table head={[t('nteam.team'), t('nav.sports'), t('nteam.coach'), t('nteam.callups'), '']}>
          {teams.map((tm) => (
            <Tr key={tm.id}>
              <Td>
                <Link href={`${base}/${tm.id}`} className="font-medium text-slate-900 hover:underline">{pick(tm.name_i18n, locale)}</Link>
                <div className="mt-0.5 flex gap-1.5">
                  <Badge tone="neutral">{t(`nteam.age.${tm.age_class}`)}</Badge>
                  <Badge tone="neutral">{t(`nteam.gender.${tm.gender}`)}</Badge>
                </div>
              </Td>
              <Td className="text-slate-700">{pick(tm.sport_name, locale)}</Td>
              <Td className="text-slate-600">{tm.head_coach_name ?? '—'}</Td>
              <Td className="tabular-nums text-slate-600">{tm.callup_count}</Td>
              <Td><Link href={`${base}/${tm.id}`} className="text-sm text-[#15607A] hover:underline">→</Link></Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
