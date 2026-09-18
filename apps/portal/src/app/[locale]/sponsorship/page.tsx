import Link from 'next/link';
import { listSponsorshipOpen, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Badge } from '@vsp/web-shared/ui';

/**
 * 후원 중개 — 공개 쇼케이스 (문서 06).
 *
 * "후원 가능" 을 켠 선수만, 성인·공개 선수만(pub.sponsorship_open) 인기 지표(구독자 수)와 함께 보여준다.
 * 연락처·제안 내용은 여기 없다 — 실제 제안은 로그인한 업무 플랫폼에서 넣는다(대외 웹은 읽기 전용).
 * 플랫폼은 소개·매칭만 하고 자금은 경유하지 않는다.
 */
export const dynamic = 'force-dynamic';

export default async function SponsorshipPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const athletes = await listSponsorshipOpen().catch(() => []);
  const platformUrl = process.env.VSP_PLATFORM_URL ?? 'http://localhost:3001';
  const proposeBase = `${platformUrl}/${locale}/sponsorship/propose`;

  return (
    <div className="space-y-6">
      <PageHeader title={t('sponsor.title')} subtitle={t('sponsor.notePlatform')} />

      {athletes.length === 0 ? (
        <EmptyState message={t('sponsor.empty')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map((a) => {
            const name = a.name_latin || a.full_name;
            const headline = pick(a.headline_i18n, locale);
            return (
              <article
                key={a.person_id}
                className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex items-center gap-4 p-5">
                  {a.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.photo_url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-semibold text-slate-400">
                      {name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {a.birth_year}
                      {a.gender ? ` · ${a.gender}` : ''}
                    </p>
                    <div className="mt-1">
                      <Badge tone="blue">
                        {t('sponsor.followers')} {a.followers.toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                </div>

                {headline ? (
                  <p className="px-5 text-sm text-slate-600 line-clamp-2">{headline}</p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 p-4">
                  <Badge tone="green">{t('sponsor.open')}</Badge>
                  <Link
                    href={`${proposeBase}?athlete=${a.person_id}`}
                    className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    {t('sponsor.propose')}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400">{t('sponsor.notePlatform')}</p>
    </div>
  );
}
