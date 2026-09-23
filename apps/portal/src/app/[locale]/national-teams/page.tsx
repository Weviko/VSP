import {
  listPublicNationalTeams, getPublicNationalTeamRoster, t as pick,
  type PublicNationalTeam, type PublicNationalTeamMember,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Badge, EmptyState } from '@vsp/web-shared/ui';

/**
 * 국가대표 (대외, 읽기 전용).
 * 종목별 대표팀 + 확정 명단(공개 대표선수만). 미성년·비공개 선수는 pub.athlete 조인으로 자동 제외.
 */
export const dynamic = 'force-dynamic';

export default async function PublicNationalTeamsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const teams: PublicNationalTeam[] = await listPublicNationalTeams().catch(() => []);
  const rosters = await Promise.all(
    teams.map((tm) => getPublicNationalTeamRoster(tm.id).catch(() => [] as PublicNationalTeamMember[]))
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('nteam.title')} />
      <p className="-mt-3 text-sm text-slate-600">{t('nteam.publicIntro')}</p>

      {teams.length === 0 ? (
        <EmptyState message={t('nteam.noTeams')} />
      ) : (
        <div className="space-y-5">
          {teams.map((tm, i) => {
            const roster = rosters[i];
            return (
              <section key={tm.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">{pick(tm.team_name, locale)}</h2>
                  <span className="text-sm text-slate-500">{pick(tm.sport_name, locale)}</span>
                  <Badge tone="neutral">{t(`nteam.age.${tm.age_class}`)}</Badge>
                  <Badge tone="neutral">{t(`nteam.gender.${tm.gender}`)}</Badge>
                </div>

                {roster.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">{t('common.noData')}</p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {roster.map((m) => (
                      <li key={m.person_id} className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm">
                        <span className="wrap-anywhere">
                          <span className="font-medium text-slate-800">{m.full_name}</span>
                          {m.name_latin && m.name_latin !== m.full_name ? <span className="ml-1 text-xs text-slate-400">{m.name_latin}</span> : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {m.jersey_no ? <span className="tabular-nums text-xs text-slate-500">#{m.jersey_no}</span> : null}
                          <Badge tone="neutral">{t(`nteam.role.${m.squad_role}`)}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
