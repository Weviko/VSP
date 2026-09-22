import Link from 'next/link';
import {
  listReports, getIntegrityStats, t as pick,
  type ReportStatus, type IntegrityCategory,
} from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, StatCard, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

/**
 * 공정·윤리 신고 처리 큐.
 * 접수 → 선별 → 조사 → 결정 → 종결의 사건을 상태·유형으로 걸러 본다.
 * 목록에는 제보자 신원을 노출하지 않는다(상세에서도 접근통제 대상).
 */
export const dynamic = 'force-dynamic';

const STATUSES: ReportStatus[] = ['RECEIVED', 'SCREENING', 'INVESTIGATING', 'DECIDED', 'CLOSED', 'DISMISSED'];
const CATEGORIES: IntegrityCategory[] = ['VIOLENCE', 'SEXUAL', 'MATCH_FIXING', 'CORRUPTION', 'OTHER'];

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'red' | 'green' | 'neutral'> = {
  RECEIVED: 'amber', SCREENING: 'amber', INVESTIGATING: 'blue', DECIDED: 'blue', CLOSED: 'green', DISMISSED: 'neutral',
};

export default async function IntegrityQueuePage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const sp = await searchParams;

  const statusFilter = STATUSES.includes(sp.status as ReportStatus) ? (sp.status as ReportStatus) : null;
  const catFilter = CATEGORIES.includes(sp.category as IntegrityCategory) ? (sp.category as IntegrityCategory) : null;

  const [rows, stats] = await Promise.all([
    listReports({ status: statusFilter, category: catFilter }).catch(() => []),
    getIntegrityStats().catch(() => ({ total: 0, open: 0, byStatus: [], byCategory: [] })),
  ]);

  const base = `/${locale}/admin/integrity`;
  const chip = (active: boolean) =>
    'rounded-full border px-3 py-1 text-xs ' +
    (active ? 'border-[#15607A] bg-[#15607A] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100');
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const status = patch.status !== undefined ? patch.status : statusFilter;
    const category = patch.category !== undefined ? patch.category : catFilter;
    if (status) p.set('status', status);
    if (category) p.set('category', category);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('integrity.queueTitle')} />
      <p className="-mt-3 text-sm text-slate-600">{t('integrity.queueSubtitle')}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('common.total')} value={stats.total} />
        <StatCard label={t('integrity.open')} value={stats.open} />
        <StatCard
          label={t('integrity.st.CLOSED')}
          value={stats.byStatus.find((s) => s.status === 'CLOSED')?.n ?? 0}
        />
      </div>

      {/* 상태 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ status: null })} className={chip(!statusFilter)}>{t('integrity.filterAll')}</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s })} className={chip(statusFilter === s)}>{t(`integrity.st.${s}`)}</Link>
        ))}
      </div>
      {/* 유형 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ category: null })} className={chip(!catFilter)}>{t('integrity.filterAll')}</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={qs({ category: c })} className={chip(catFilter === c)}>{t(`integrity.cat.${c}`)}</Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <Table head={[t('integrity.caseNo'), t('integrity.category'), t('doc.subject'), t('integrity.sport'), t('integrity.assignee'), t('integrity.status'), t('integrity.received')]}>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <Link href={`${base}/${r.id}`} className="font-mono text-xs font-semibold text-[#15607A] hover:underline">
                  {r.case_no}
                </Link>
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-800">{t(`integrity.cat.${r.category}`)}</span>
                  {r.is_minor_involved ? (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">{t('integrity.minorInvolved')}</span>
                  ) : null}
                </div>
              </Td>
              <Td className="text-slate-700 wrap-anywhere">
                <Link href={`${base}/${r.id}`} className="hover:underline">{r.title}</Link>
              </Td>
              <Td className="text-slate-600">{r.sport_name ? pick(r.sport_name, locale) : '—'}</Td>
              <Td className="text-slate-600">{r.assigned_name ?? t('integrity.unassigned')}</Td>
              <Td><Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`integrity.st.${r.status}`)}</Badge></Td>
              <Td className="tabular-nums text-slate-400">{r.received_at?.slice(0, 10)}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
