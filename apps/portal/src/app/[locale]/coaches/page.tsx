import { listPublicCoachQualifications, t as pick, type PublicCoachQualification } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';

/**
 * 자격 보유 지도자 (대외, 읽기 전용).
 * 공개 지도자(pub.staff)의 유효 자격만. PII 없음(전화·CCCD 미포함).
 */
export const dynamic = 'force-dynamic';

export default async function PublicCoachesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const rows: PublicCoachQualification[] = await listPublicCoachQualifications(100).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('coach.qualified')} />
      <p className="-mt-3 text-sm text-slate-600">{t('coach.publicIntro')}</p>

      {rows.length === 0 ? (
        <EmptyState message={t('coach.noCredentials')} />
      ) : (
        <Table head={[t('coach.person'), t('coach.grade'), t('nav.sports'), t('coach.obtained'), t('coach.expires')]}>
          {rows.map((r) => (
            <Tr key={`${r.person_id}-${r.grade_name?.vi ?? r.level_order}`}>
              <Td className="font-medium text-slate-900 wrap-anywhere">
                {r.full_name}
                {r.name_latin && r.name_latin !== r.full_name ? <span className="ml-1 text-xs text-slate-400">{r.name_latin}</span> : null}
              </Td>
              <Td><Badge tone="blue">{pick(r.grade_name, locale)}</Badge></Td>
              <Td className="text-slate-600">{r.sport_name ? pick(r.sport_name, locale) : '—'}</Td>
              <Td className="tabular-nums text-slate-500">{r.obtained_year ?? '—'}</Td>
              <Td className="tabular-nums text-slate-500">{r.expires_year ?? '—'}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
