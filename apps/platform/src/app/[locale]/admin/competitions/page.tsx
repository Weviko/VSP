import Link from 'next/link';
import { t as pick } from '@vsp/core-admin';
import { listOpsMatches } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

const M_TONE: Record<string, 'blue' | 'green' | 'neutral' | 'amber'> = { LIVE: 'blue', FINISHED: 'green', SCHEDULED: 'amber', CANCELLED: 'neutral' };

export default async function CompetitionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const matches = await listOpsMatches({}).catch(() => []);
  const base = `/${locale}/admin/competitions`;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.title')} />

      {matches.length === 0 ? (
        <EmptyState message={t('ops.noMatches')} />
      ) : (
        <Table head={[t('nav.events'), t('ops.match'), t('ops.officials'), t('integrity.status'), '']}>
          {matches.map((m) => (
            <Tr key={m.id}>
              <Td className="text-slate-700 wrap-anywhere">{pick(m.event_name, locale)}</Td>
              <Td>
                <Link href={`${base}/${m.id}`} className="font-medium text-slate-900 hover:underline">
                  {[m.round_name, m.match_no].filter(Boolean).join(' · ') || t('ops.match')}
                </Link>
                {m.scheduled_at ? <span className="ml-2 tabular-nums text-xs text-slate-400">{m.scheduled_at.slice(0, 16).replace('T', ' ')}</span> : null}
              </Td>
              <Td className="tabular-nums text-slate-600">{m.official_count}</Td>
              <Td><Badge tone={M_TONE[m.status] ?? 'neutral'}>{t(`ops.mstatus.${m.status}`)}</Badge></Td>
              <Td><Link href={`${base}/${m.id}`} className="text-sm text-[#15607A] hover:underline">→</Link></Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
