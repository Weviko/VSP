import Link from 'next/link';
import { t as pick } from '@vsp/core-admin';
import { listClubs, listSports, getClubStats, type ClubType } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, StatCard, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import { createClubForm, searchPersonsAction } from './actions';

export const dynamic = 'force-dynamic';

const CTYPES: ClubType[] = ['COMMUNITY', 'PUBLIC', 'DESIGNATED'];
const CSTATUS_TONE: Record<string, 'amber' | 'green' | 'red' | 'neutral'> = {
  SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red', SUSPENDED: 'red', CLOSED: 'neutral', DRAFT: 'neutral',
};
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function ClubsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [clubs, sports, stats] = await Promise.all([
    listClubs({}).catch(() => []),
    listSports({ onlyActive: true }).catch(() => []),
    getClubStats().catch(() => ({ clubs: 0, members: 0, programs: 0, designated: 0, pending: 0 })),
  ]);
  const pl = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const base = `/${locale}/admin/clubs`;

  return (
    <div className="space-y-6">
      <PageHeader title={t('club.title')} />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label={t('club.statClubs')} value={stats.clubs} />
        <StatCard label={t('club.statMembers')} value={stats.members} />
        <StatCard label={t('club.statPrograms')} value={stats.programs} />
        <StatCard label={t('club.designated')} value={stats.designated} />
        <StatCard label={t('club.pending')} value={stats.pending} />
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('club.newClub')}</summary>
          <form action={createClubForm.bind(null, locale)} className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="name_vi" placeholder="Tên CLB (VI)" className={input} />
              <input name="name_en" placeholder="Name (EN)" className={input} />
              <input name="name_ko" placeholder="이름 (KO)" className={input} />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('nav.sports')}</span>
                <select name="sport_id" required defaultValue="" className={input}>
                  <option value="" disabled>—</option>
                  {sports.map((s) => <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('club.ctype.COMMUNITY')}</span>
                <select name="club_type" defaultValue="COMMUNITY" className={input}>
                  {CTYPES.map((c) => <option key={c} value={c}>{t(`club.ctype.${c}`)}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('club.region')}</span>
                <input name="region_code" className={input} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('club.capacity')}</span>
                <input type="number" name="member_capacity" min="1" className={input} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('club.venue')}</span>
                <input name="venue_text" className={input} />
              </label>
              <div className="text-sm">
                <span className="mb-1 block text-slate-600">{t('club.representative')}</span>
                <PersonPicker name="representative_person_id" onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
              </div>
            </div>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('club.newClub')}</button>
          </form>
        </details>
      </Card>

      {clubs.length === 0 ? (
        <EmptyState message={t('club.noClubs')} />
      ) : (
        <Table head={[t('club.club'), t('nav.sports'), t('club.region'), t('club.ctype.COMMUNITY'), t('club.members'), t('club.programs'), t('integrity.status')]}>
          {clubs.map((c) => (
            <Tr key={c.id}>
              <Td>
                <Link href={`${base}/${c.id}`} className="font-medium text-slate-900 hover:underline">{pick(c.name_i18n, locale)}</Link>
              </Td>
              <Td className="text-slate-700">{pick(c.sport_name, locale)}</Td>
              <Td className="text-slate-600">{c.region_code ?? '—'}</Td>
              <Td><Badge tone="neutral">{t(`club.ctype.${c.club_type}`)}</Badge></Td>
              <Td className="tabular-nums text-slate-700">{c.member_count}</Td>
              <Td className="tabular-nums text-slate-600">{c.program_count}</Td>
              <Td><Badge tone={CSTATUS_TONE[c.status] ?? 'neutral'}>{t(`club.cstatus.${c.status}`)}</Badge></Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
