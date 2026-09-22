import Link from 'next/link';
import { listAllProposals, proposalSummary } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

/**
 * 후원 관리 (업무 플랫폼) — 대외 웹에서 들어온 후원 제안을 협회가 한눈에 본다.
 * 상태별 집계 + 최근 제안 목록(선수·후원사·금액·연락처·상태).
 */
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'red' | 'neutral'> = {
  SENT: 'blue', VIEWED: 'amber', ACCEPTED: 'blue', DECLINED: 'red',
};

export default async function AdminSponsorshipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [rows, summary] = await Promise.all([
    listAllProposals({ limit: 200 }).catch(() => []),
    proposalSummary().catch(() => []),
  ]);
  const total = summary.reduce((a, s) => a + s.n, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t('sponsor.title')} />

      {/* 상태별 요약 */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{total}</p>
          <p className="text-xs text-slate-500">{t('common.total')}</p>
        </div>
        {summary.map((s) => (
          <div key={s.status} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-2xl font-bold tabular-nums text-slate-900">{s.n}</p>
            <p className="text-xs text-slate-500">{s.status}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <Table head={[t('person.name'), t('sponsor.sponsorName'), t('sponsor.budget'), t('sponsor.contact'), t('person.status'), '']}>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <Link href={`/${locale}/admin/people/${r.athlete_person_id}`} className="font-medium text-slate-900 hover:underline">
                  {r.athlete_name ?? '—'}
                </Link>
              </Td>
              <Td className="text-slate-700 wrap-anywhere">{r.sponsor_name}</Td>
              <Td className="tabular-nums text-slate-700">{r.budget ?? '—'}</Td>
              <Td className="text-slate-600 wrap-anywhere">{r.sponsor_contact ?? '—'}</Td>
              <Td><Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge></Td>
              <Td className="tabular-nums text-slate-400">{r.created_at?.slice(0, 10)}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
