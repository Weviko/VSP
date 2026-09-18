import Link from 'next/link';
import { searchAthletes, listRegionCodes, listSports, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Table, Tr, Td, EmptyState, Badge } from '@vsp/web-shared/ui';

/**
 * 선수 통합검색 (공개).
 * 대한체육회 선수통합검색과 같은 필터·컬럼 구성이다.
 * 검색 조건을 URL 쿼리로 유지해 결과를 그대로 공유·북마크할 수 있게 한다.
 */
export const dynamic = 'force-dynamic';

export default async function AthleteSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sport?: string; region?: string; gender?: string; q?: string; page?: string }>;
}) {
  const { locale: raw } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const [sports, regions] = await Promise.all([
    listSports().catch(() => []),
    listRegionCodes().catch(() => []),
  ]);

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

  const sel = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader title={t('search.title')} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t('search.sport')}</label>
          <select name="sport" defaultValue={sp.sport ?? ''} className={sel}>
            <option value="">{t('search.all')}</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{t('search.region')}</label>
          <select name="region" defaultValue={sp.region ?? ''} className={sel}>
            <option value="">{t('search.all')}</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
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
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('search.submit')}
        </button>
      </form>

      {!hasFilter ? (
        <EmptyState message={t('search.hint')} />
      ) : !result ? (
        <EmptyState message={t('common.noData')} />
      ) : result.total === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {t('search.found', { n: result.total })}
          </p>
          <Table
            head={[
              '#', t('person.name'), t('search.birthYear'), t('search.gender'),
              t('search.region'), t('search.sport'), t('search.division'), t('search.team'),
            ]}
          >
            {result.rows.map((r, i) => (
              <Tr key={r.person_id}>
                <Td className="tabular-nums text-slate-400">
                  {(result.page - 1) * result.pageSize + i + 1}
                </Td>
                <Td>
                  <Link
                    href={`/${locale}/athletes/${r.person_id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {r.full_name}
                  </Link>
                </Td>
                <Td className="tabular-nums text-slate-600">{r.birth_year ?? '—'}</Td>
                <Td className="text-slate-600">
                  {r.gender === 'M' ? t('search.male') : r.gender === 'F' ? t('search.female') : '—'}
                </Td>
                <Td className="text-slate-600">{r.region_code ?? '—'}</Td>
                <Td className="text-slate-600">{pick(r.sport_name, locale)}</Td>
                <Td className="text-slate-600">{r.division ?? '—'}</Td>
                <Td className="text-slate-600 wrap-anywhere">
                  {r.team_name ? pick(r.team_name, locale) : pick(r.org_name, locale)}
                </Td>
              </Tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
