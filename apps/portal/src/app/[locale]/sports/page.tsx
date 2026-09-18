import Link from 'next/link';
import { listSports, listSportStats, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Badge } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/** 종목 목록. 정회원/준회원 구분은 관장 단체의 상태로 갈음한다(한국 경영공시 모델). */
export default async function SportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const sports = await listSports().catch(() => []);
  const stats = await listSportStats().catch(() => []);
  const byId = new Map(stats.map((s) => [s.sport_id, s]));

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.sports')} subtitle={`${sports.length}`} />
      {sports.length === 0 ? (
        <EmptyState message={t('sport.empty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sports.map((s) => {
            const st = byId.get(s.id);
            return (
              <li key={s.id}>
                <Link
                  href={`/${locale}/${s.code.toLowerCase()}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-900">{pick(s.name_i18n, locale)}</span>
                    <div className="flex shrink-0 gap-1">
                      {s.is_olympic ? <Badge tone="blue">Olympic</Badge> : null}
                      {s.is_seagames ? <Badge>SEA</Badge> : null}
                    </div>
                  </div>
                  {st ? (
                    <p className="mt-2 text-sm tabular-nums text-slate-600">
                      {t('sport.athletes')} {st.athletes} · {t('sport.upcoming')} {st.upcoming_events}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
