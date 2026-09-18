import Link from 'next/link';
import { getOrgTree, orgChildCounts, listRegionCodes, t as pick, type PublicOrgNode } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Table, Tr, Td, Badge, statusTone } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

function flatten(nodes: PublicOrgNode[], depth = 0): Array<{ node: PublicOrgNode; depth: number }> {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flatten(n.children, depth + 1)]);
}

/**
 * 체육단체 디렉토리 (공개).
 *
 * 성/시 지부까지 하면 1,500개가 넘어, 기본 화면에는 성/시 지부를 접고 상위 구조만 보인다
 * (연맹마다 "N개 성/시 지부" 개수 표시). 성/시를 고르면 그 지역의 지부만 펼친다.
 */
export default async function OrgsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ region?: string }>;
}) {
  const { locale: raw } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const base = `/${locale}/orgs`;

  const [tree, counts, regions] = await Promise.all([
    getOrgTree().catch((): PublicOrgNode[] => []),
    orgChildCounts().catch(() => new Map<string, number>()),
    listRegionCodes().catch((): string[] => []),
  ]);
  const region = sp.region && regions.includes(sp.region) ? sp.region : null;

  // 기본: 성/시 지부(PROVINCE_FED)는 접는다. 지역을 고르면 그 지역 지부만 펼친다.
  const rows = flatten(tree).filter(({ node }) =>
    node.level_type !== 'PROVINCE_FED' || (region !== null && node.region_code === region)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.orgs')}
        subtitle={t('org.dirSubtitle')}
        right={
          <Link href={`/${locale}/orgs/disclosure`} className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            {t('nav.disclosure')}
          </Link>
        }
      />

      {/* 지역(성/시) 필터 */}
      {regions.length > 0 ? (
        <nav className="flex flex-wrap gap-2">
          <Link href={base} className={'rounded-full px-3 py-1 text-sm ' + (!region ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')}>
            {t('org.central')}
          </Link>
          {regions.map((rc) => (
            <Link key={rc} href={`${base}?region=${rc}`} className={'rounded-full px-3 py-1 text-sm ' + (region === rc ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')}>
              {rc}
            </Link>
          ))}
        </nav>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState message={t('org.empty')} />
      ) : (
        <Table head={[t('org.name'), t('org.levelType'), t('org.region'), t('common.status')]}>
          {rows.map(({ node, depth }) => {
            const provinceCount = node.level_type === 'NATIONAL_FED' ? counts.get(node.id) ?? 0 : 0;
            return (
              <Tr key={node.id}>
                <Td className="wrap-anywhere">
                  <span style={{ paddingLeft: depth * 16 }} className="inline-block">
                    {depth > 0 ? <span className="mr-1 text-slate-300">└</span> : null}
                    <span className="font-medium text-slate-900">{pick(node.name_i18n, locale)}</span>
                    {provinceCount > 0 && !region ? (
                      <Link href={`${base}?region=${regions[0] ?? ''}`} className="ml-2 align-middle">
                        <Badge tone="blue">{t('org.provinceUnits', { n: provinceCount })}</Badge>
                      </Link>
                    ) : null}
                  </span>
                </Td>
                <Td className="text-slate-600">{pick(node.level_name, locale)}</Td>
                <Td className="text-slate-600">{node.region_code ?? '-'}</Td>
                <Td><Badge tone={statusTone(node.status)}>{t(`status.${node.status}`)}</Badge></Td>
              </Tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
