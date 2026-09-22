import Link from 'next/link';
import { searchAthletes, listStaff, listRegionCodes, listSports, REG_TYPE_LABELS, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Table, Tr, Td, EmptyState, Badge } from '@vsp/web-shared/ui';

/**
 * 인물 통합검색 (공개) — 선수 / 지도자(코치·감독) 탭.
 * 선수는 대한체육회 선수통합검색식 필터, 지도자는 종목별 목록.
 */
export const dynamic = 'force-dynamic';

export default async function PeopleSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sport?: string; region?: string; gender?: string; q?: string; page?: string; role?: string }>;
}) {
  const { locale: raw } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const role = sp.role === 'staff' ? 'staff' : 'athlete';

  const [sports, regions] = await Promise.all([
    listSports().catch(() => []),
    listRegionCodes().catch(() => []),
  ]);

  const sel = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';
  const tab = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`;

  // 탭 바 (선수 / 지도자)
  const tabs = (
    <div className="flex gap-2">
      <Link href={`/${locale}/athletes`} className={tab(role === 'athlete')}>{pick(REG_TYPE_LABELS.ATHLETE, locale)}</Link>
      <Link href={`/${locale}/athletes?role=staff`} className={tab(role === 'staff')}>{pick(REG_TYPE_LABELS.COACH, locale)}</Link>
    </div>
  );

  if (role === 'staff') {
    const staff = await listStaff({ sportId: sp.sport || null }).catch(() => []);
    return (
      <div className="space-y-6">
        <PageHeader title={t('search.title')} />
        {tabs}
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <input type="hidden" name="role" value="staff" />
          <div>
            <label className="mb-1 block text-xs text-slate-600">{t('search.sport')}</label>
            <select name="sport" defaultValue={sp.sport ?? ''} className={sel}>
              <option value="">{t('search.all')}</option>
              {sports.map((s) => (<option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>))}
            </select>
          </div>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('search.submit')}</button>
        </form>
        {staff.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={['#', t('person.name'), t('person.role'), t('search.sport'), t('org.name'), t('search.region')]}>
            {staff.map((r, i) => (
              <Tr key={r.id}>
                <Td className="tabular-nums text-slate-400">{i + 1}</Td>
                <Td>
                  <Link href={`/${locale}/athletes/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.name_latin ?? r.full_name}</Link>
                </Td>
                <Td><Badge tone="blue">{pick(REG_TYPE_LABELS[r.reg_type as keyof typeof REG_TYPE_LABELS] ?? REG_TYPE_LABELS.COACH, locale)}</Badge></Td>
                <Td className="text-slate-600">{r.sport_name ? pick(r.sport_name, locale) : '—'}</Td>
                <Td className="text-slate-600 wrap-anywhere">{r.org_name ? pick(r.org_name, locale) : '—'}</Td>
                <Td className="text-slate-600">{r.region_code ?? '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </div>
    );
  }

  // ── 선수 검색 (기존) ──
  const hasFilter = Boolean(sp.sport || sp.region || sp.gender || sp.q);
  const result = hasFilter
    ? await searchAthletes({
        sportId: sp.sport || null,
        regionCode: sp.region || null,
        gender: (sp.gender as 'M' | 'F') || null,
        name: sp.q || null,
        page: Number(sp.page ?? 1),
      }).catch(() => null)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('search.title')} />
      {tabs}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t('search.sport')}</label>
          <select name="sport" defaultValue={sp.sport ?? ''} className={sel}>
            <option value="">{t('search.all')}</option>
            {sports.map((s) => (<option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t('search.region')}</label>
          <select name="region" defaultValue={sp.region ?? ''} className={sel}>
            <option value="">{t('search.all')}</option>
            {regions.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t('search.gender')}</label>
          <select name="gender" defaultValue={sp.gender ?? ''} className={sel}>
            <option value="">{t('search.all')}</option>
            <option value="M">{t('search.male')}</option>
            <option value="F">{t('search.female')}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t('search.name')}</label>
          <input name="q" defaultValue={sp.q ?? ''} className={sel} placeholder="Nguyen Van A" />
        </div>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('search.submit')}</button>
      </form>

      {!hasFilter ? (
        <EmptyState message={t('search.hint')} />
      ) : !result || result.total === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <>
          <p className="text-sm text-slate-600">{t('search.found', { n: result.total })}</p>
          <Table head={['#', t('person.name'), t('search.birthYear'), t('search.gender'), t('search.region'), t('search.sport'), t('search.division'), t('search.team')]}>
            {result.rows.map((r, i) => (
              <Tr key={r.person_id}>
                <Td className="tabular-nums text-slate-400">{(result.page - 1) * result.pageSize + i + 1}</Td>
                <Td>
                  <Link href={`/${locale}/athletes/${r.person_id}`} className="font-medium text-slate-900 hover:underline">{r.full_name}</Link>
                </Td>
                <Td className="tabular-nums text-slate-600">{r.birth_year ?? '—'}</Td>
                <Td className="text-slate-600">{r.gender === 'M' ? t('search.male') : r.gender === 'F' ? t('search.female') : '—'}</Td>
                <Td className="text-slate-600">{r.region_code ?? '—'}</Td>
                <Td className="text-slate-600">{pick(r.sport_name, locale)}</Td>
                <Td className="text-slate-600">{r.division ?? '—'}</Td>
                <Td className="text-slate-600 wrap-anywhere">{r.team_name ? pick(r.team_name, locale) : pick(r.org_name, locale)}</Td>
              </Tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
