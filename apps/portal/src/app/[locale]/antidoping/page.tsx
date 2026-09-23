import {
  listAntidopingSanctions, getAntidopingStats, t as pick,
  type PublicAntidopingSanction, type PublicAntidopingStat,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';

/**
 * 도핑방지 (대외, 읽기 전용).
 * 공개 위반이력(성인·is_public 만)과 연도별 검사·교육 집계. 검사 원자료·TUE·의료정보는 공개하지 않는다.
 */
export const dynamic = 'force-dynamic';

const STYPE_TONE: Record<string, 'red' | 'amber' | 'neutral'> = { SUSPENSION: 'red', DQ: 'red', WARNING: 'amber' };

export default async function PublicAntidopingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const [sanctions, stats] = await Promise.all([
    listAntidopingSanctions(50).catch(() => [] as PublicAntidopingSanction[]),
    getAntidopingStats().catch(() => [] as PublicAntidopingStat[]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('adop.title')} />
      <p className="-mt-3 text-sm text-slate-600">{t('adop.publicIntro')}</p>

      {/* 연도별 집계 */}
      {stats.length > 0 ? (
        <section className="space-y-3">
          <h2 className="border-l-[3px] border-[#15607A] pl-2.5 text-lg font-semibold text-slate-900">{t('adop.statTitle')}</h2>
          <Table head={['', t('adop.statTests'), t('adop.statAaf'), t('adop.statEducated')]}>
            {stats.map((s) => (
              <Tr key={s.year}>
                <Td className="font-semibold text-slate-800 tabular-nums">{s.year}</Td>
                <Td className="tabular-nums text-slate-700">{s.tests}</Td>
                <Td className="tabular-nums text-slate-700">{s.aaf}</Td>
                <Td className="tabular-nums text-slate-700">{s.educated}</Td>
              </Tr>
            ))}
          </Table>
        </section>
      ) : null}

      {/* 공개 위반이력 */}
      <section className="space-y-3">
        <h2 className="border-l-[3px] border-[#15607A] pl-2.5 text-lg font-semibold text-slate-900">{t('adop.sanctionList')}</h2>
        {sanctions.length === 0 ? (
          <EmptyState message={t('adop.noSanctions')} />
        ) : (
          <Table head={[t('adop.person'), t('adop.sport'), t('adop.sanctionTypeLabel'), t('adop.article'), t('adop.period')]}>
            {sanctions.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{s.full_name}</Td>
                <Td className="text-slate-600">{s.sport_name ? pick(s.sport_name, locale) : '—'}</Td>
                <Td><Badge tone={STYPE_TONE[s.sanction_type] ?? 'neutral'}>{t(`adop.stype.${s.sanction_type}`)}</Badge></Td>
                <Td className="text-slate-600">{s.adrv_article ?? '—'}</Td>
                <Td className="tabular-nums text-slate-500">{s.starts_on?.slice(0, 10) ?? '—'}{s.ends_on ? ` ~ ${s.ends_on.slice(0, 10)}` : ''}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
