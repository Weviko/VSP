import Link from 'next/link';
import {
  listPublicClubs, listPublicPrograms, getClubStatsByRegion, t as pick,
  type PublicClub, type PublicClubProgram, type ClubRegionStat,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';

/**
 * 생활체육 클럽 찾기 (대외, 읽기 전용).
 * 승인·활성 클럽, 모집 중 프로그램, 지역별 참여 현황. 회원 개인정보는 없다(집계만).
 */
export const dynamic = 'force-dynamic';

export default async function PublicClubsPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ region?: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const sp = await searchParams;
  const region = sp.region?.trim() || null;

  const [clubs, programs, stats] = await Promise.all([
    listPublicClubs({ regionCode: region }).catch(() => [] as PublicClub[]),
    listPublicPrograms({ regionCode: region }).catch(() => [] as PublicClubProgram[]),
    getClubStatsByRegion().catch(() => [] as ClubRegionStat[]),
  ]);
  const base = `/${locale}/clubs`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('club.findClub')} />
      <p className="-mt-3 text-sm text-slate-600">{t('club.publicIntro')}</p>

      {/* 지역별 참여 현황 */}
      {stats.length > 0 ? (
        <section className="space-y-3">
          <h2 className="border-l-[3px] border-[#15607A] pl-2.5 text-lg font-semibold text-slate-900">{t('club.statByRegion')}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href={base} className={'rounded-full border px-3 py-1 text-xs ' + (!region ? 'border-[#15607A] bg-[#15607A] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100')}>{t('club.title')}</Link>
            {stats.map((s) => (
              <Link key={s.region_code ?? 'none'} href={`${base}?region=${encodeURIComponent(s.region_code ?? '')}`}
                className={'rounded-full border px-3 py-1 text-xs ' + (region === s.region_code ? 'border-[#15607A] bg-[#15607A] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100')}>
                {s.region_code ?? '—'} · {s.clubs}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* 클럽 */}
      <section className="space-y-3">
        <h2 className="border-l-[3px] border-[#15607A] pl-2.5 text-lg font-semibold text-slate-900">{t('club.clubs')}</h2>
        {clubs.length === 0 ? (
          <EmptyState message={t('club.noClubs')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {clubs.map((c) => (
              <Card key={c.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 wrap-anywhere">{pick(c.name_i18n, locale)}</span>
                  <Badge tone="neutral">{t(`club.ctype.${c.club_type}`)}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{pick(c.sport_name, locale)}</span>
                  {c.region_code ? <span>· {c.region_code}</span> : null}
                  {c.venue_text ? <span>· {c.venue_text}</span> : null}
                  <span className="tabular-nums">· {t('club.members')} {c.member_count}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 모집 중 프로그램 */}
      <section className="space-y-3">
        <h2 className="border-l-[3px] border-[#15607A] pl-2.5 text-lg font-semibold text-slate-900">{t('club.programs')}</h2>
        {programs.length === 0 ? (
          <EmptyState message={t('club.noPrograms')} />
        ) : (
          <Table head={[t('club.program'), t('club.club'), t('club.categoryLabel'), t('club.schedule'), t('club.capacity')]}>
            {programs.map((pr) => (
              <Tr key={pr.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{pick(pr.name_i18n, locale)}</Td>
                <Td className="text-slate-600 wrap-anywhere">{pick(pr.club_name, locale)}</Td>
                <Td><Badge tone="neutral">{t(`club.pcat.${pr.category}`)}</Badge></Td>
                <Td className="text-slate-600">{pr.schedule_text ?? '—'}</Td>
                <Td className="tabular-nums text-slate-600">{pr.enrolled_count}{pr.capacity != null ? `/${pr.capacity}` : ''}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
