import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t as pick } from '@vsp/core-admin';
import { getClub, listClubMembers, listPrograms, type MemberRole, type ProgramCategory, type ProgramStatus } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import {
  approveClubForm, rejectClubForm, addMemberForm, endMemberForm,
  createProgramForm, setProgramStatusForm, enrollForm, searchPersonsAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const ROLES: MemberRole[] = ['MEMBER', 'LEADER', 'INSTRUCTOR'];
const PCATS: ProgramCategory[] = ['ALL', 'YOUTH', 'ADULT', 'SENIOR', 'PARA'];
const PSTATUS: ProgramStatus[] = ['OPEN', 'CLOSED', 'FINISHED', 'DRAFT'];
const CSTATUS_TONE: Record<string, 'amber' | 'green' | 'red' | 'neutral'> = {
  SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red', SUSPENDED: 'red', CLOSED: 'neutral', DRAFT: 'neutral',
};
const PSTATUS_TONE: Record<string, 'amber' | 'green' | 'neutral'> = { OPEN: 'green', DRAFT: 'neutral', CLOSED: 'amber', FINISHED: 'neutral' };
const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default async function ClubDetailPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; clubId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { locale: raw, clubId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const sp = await searchParams;

  const club = await getClub(clubId).catch(() => null);
  if (!club) notFound();
  const [members, programs] = await Promise.all([
    listClubMembers(clubId).catch(() => []),
    listPrograms(clubId).catch(() => []),
  ]);
  const pl = { search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') };
  const base = `/${locale}/admin/clubs`;

  return (
    <div className="space-y-6">
      <div><Link href={base} className="text-sm text-[#15607A] hover:underline">← {t('club.title')}</Link></div>
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={pick(club.name_i18n, locale)} />
        <Badge tone={CSTATUS_TONE[club.status] ?? 'neutral'}>{t(`club.cstatus.${club.status}`)}</Badge>
        <Badge tone="neutral">{t(`club.ctype.${club.club_type}`)}</Badge>
        {club.region_code ? <span className="text-sm text-slate-500">{club.region_code}</span> : null}
      </div>

      {sp.err === 'full' ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{t('club.full')}</p> : null}

      {club.status === 'SUBMITTED' ? (
        <div className="flex gap-2">
          <form action={approveClubForm.bind(null, locale, club.id)}>
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">{t('club.approve')}</button>
          </form>
          <form action={rejectClubForm.bind(null, locale, club.id)} className="flex gap-2">
            <input name="reason" placeholder={t('integrity.reason')} className={input} />
            <button className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">{t('club.reject')}</button>
          </form>
        </div>
      ) : null}

      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">{t('nav.sports')}</dt><dd className="text-slate-800">{pick(club.sport_name, locale)}</dd></div>
          <div><dt className="text-slate-500">{t('club.representative')}</dt><dd className="text-slate-800">{club.representative_name ?? '—'}</dd></div>
          <div><dt className="text-slate-500">{t('club.venue')}</dt><dd className="text-slate-800 wrap-anywhere">{club.venue_text ?? '—'}</dd></div>
          <div><dt className="text-slate-500">{t('club.members')}</dt><dd className="tabular-nums text-slate-800">{club.member_count}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 회원 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">{t('club.members')}</h2>
          <Card>
            <form action={addMemberForm.bind(null, locale, club.id)} className="space-y-2">
              <PersonPicker name="person_id" required onSearch={searchPersonsAction.bind(null, locale)} labels={pl} />
              <div className="flex gap-2">
                <select name="role" defaultValue="MEMBER" className={input}>
                  {ROLES.map((r) => <option key={r} value={r}>{t(`club.role.${r}`)}</option>)}
                </select>
                <button className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('club.addMember')}</button>
              </div>
            </form>
          </Card>
          {members.length === 0 ? (
            <EmptyState message={t('club.empty')} />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="wrap-anywhere"><span className="font-medium text-slate-800">{m.full_name}</span> <Badge tone="neutral">{t(`club.role.${m.role}`)}</Badge></span>
                  <form action={endMemberForm.bind(null, locale, club.id)}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{t('club.endMember')}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 프로그램 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">{t('club.programs')}</h2>
          <Card>
            <form action={createProgramForm.bind(null, locale, club.id)} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="pname_vi" placeholder="VI" className={input} />
                <input name="pname_en" placeholder="EN" className={input} />
                <input name="pname_ko" placeholder="KO" className={input} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select name="category" defaultValue="ALL" className={input}>
                  {PCATS.map((c) => <option key={c} value={c}>{t(`club.pcat.${c}`)}</option>)}
                </select>
                <input type="number" name="capacity" min="1" placeholder={t('club.capacity')} className={input} />
              </div>
              <input name="schedule_text" placeholder={t('club.schedule')} className={input} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" name="starts_on" className={input} />
                <input type="date" name="ends_on" className={input} />
              </div>
              <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('club.newProgram')}</button>
            </form>
          </Card>
          {programs.length === 0 ? (
            <EmptyState message={t('club.noPrograms')} />
          ) : (
            <ul className="space-y-2">
              {programs.map((pr) => (
                <li key={pr.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 wrap-anywhere">{pick(pr.name_i18n, locale)}</span>
                    <Badge tone={PSTATUS_TONE[pr.status] ?? 'neutral'}>{t(`club.pstatus.${pr.status}`)}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge tone="neutral">{t(`club.pcat.${pr.category}`)}</Badge>
                    {pr.schedule_text ? <span>{pr.schedule_text}</span> : null}
                    <span className="tabular-nums">{pr.enrolled_count}{pr.capacity != null ? `/${pr.capacity}` : ''}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {pr.status === 'OPEN' && members.length > 0 ? (
                      <form action={enrollForm.bind(null, locale, club.id)} className="flex items-center gap-1">
                        <input type="hidden" name="program_id" value={pr.id} />
                        <select name="club_member_id" defaultValue="" className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                          <option value="" disabled>{t('club.member')}</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                        </select>
                        <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100">{t('club.enroll')}</button>
                      </form>
                    ) : null}
                    <form action={setProgramStatusForm.bind(null, locale, club.id)} className="flex items-center gap-1">
                      <input type="hidden" name="program_id" value={pr.id} />
                      <select name="status" defaultValue={pr.status} className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                        {PSTATUS.map((s) => <option key={s} value={s}>{t(`club.pstatus.${s}`)}</option>)}
                      </select>
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">{t('common.save')}</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
