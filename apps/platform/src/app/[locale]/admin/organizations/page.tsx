import { getOrgTree, listLevelTypes, query, t as pick, type OrgTreeNode, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import Link from 'next/link';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, ButtonLink, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

// 관리자 화면은 실시간 데이터가 필요하다 (빌드 타임 정적 생성 금지)
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Organizations' };

async function load() {
  try {
    // 성/시 지부까지 하면 1,500개가 넘는다. 목록은 국가연맹(depth 2)까지만 펼치고,
    // 그 하위(성/시 지부)는 각 단체 상세에서 관리한다. 하위 개수만 집계로 함께 보인다.
    const [tree, levels, childRows] = await Promise.all([
      getOrgTree({ includeInactive: true, maxDepth: 2 }),
      listLevelTypes(),
      query<{ parent_id: UUID; n: number }>(
        `SELECT parent_id, count(*)::int AS n FROM core.organization
          WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id`
      ),
    ]);
    const childCounts = new Map(childRows.map((r) => [r.parent_id, r.n]));
    return { tree, levels, childCounts, error: undefined as string | undefined };
  } catch (e) {
    return { tree: null, levels: null, childCounts: new Map<UUID, number>(), error: e instanceof Error ? e.message : String(e) };
  }
}

/** 트리를 들여쓰기된 행으로 평면화 */
function flatten(nodes: OrgTreeNode[], depth = 0): Array<{ node: OrgTreeNode; depth: number }> {
  return nodes.flatMap((n) => [{ node: n, depth }, ...flatten(n.children, depth + 1)]);
}

export default async function OrganizationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { tree, levels, childCounts, error } = await load();

  const levelLabel = new Map((levels ?? []).map((l) => [l.code, pick(l.name_i18n, locale)]));
  const rows = tree ? flatten(tree) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('org.title')}
        subtitle={t('org.subtitle')}
        right={
          <>
            {tree ? (
              <span className="text-sm text-slate-500">
                {t('common.total')}: <strong className="tabular-nums">{rows.length}</strong>
              </span>
            ) : null}
            <ButtonLink href={`/${locale}/admin/organizations/import`} variant="secondary">{t('nav.import')}</ButtonLink>
            <ButtonLink href={`/${locale}/admin/organizations/new`}>{t('org.create')}</ButtonLink>
          </>
        }
      />

      {!tree ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('org.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">{t('org.name')}</th>
                <th className="px-4 py-2 font-medium">{t('org.levelType')}</th>
                <th className="px-4 py-2 font-medium">{t('org.region')}</th>
                <th className="px-4 py-2 font-medium">{t('common.status')}</th>
                <th className="px-4 py-2 font-medium">{t('org.effectiveTo')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => (
                <tr key={node.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 wrap-anywhere">
                    <span style={{ paddingLeft: depth * 16 }} className="inline-block">
                      {depth > 0 ? <span className="mr-1 text-slate-300">└</span> : null}
                      <Link
                        href={`/${locale}/admin/organizations/${node.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {pick(node.name_i18n, locale)}
                      </Link>
                      {node.short_name ? (
                        <span className="ml-2 text-slate-400">({node.short_name})</span>
                      ) : null}
                      {(childCounts.get(node.id) ?? 0) > 0 ? (
                        <Link href={`/${locale}/admin/organizations/${node.id}`} className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700 hover:bg-sky-100">
                          +{childCounts.get(node.id)}
                        </Link>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {levelLabel.get(node.level_type) ?? node.level_type}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{node.region_code ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        node.status === 'ACTIVE'
                          ? 'rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                          : 'rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'
                      }
                    >
                      {t(`status.${node.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500 tabular-nums">
                    {node.effective_to ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
