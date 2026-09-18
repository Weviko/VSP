import Link from 'next/link';
import { listNews, listSports, t as pick, type UUID } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState } from '@vsp/web-shared/ui';

/**
 * 뉴스 (네이버 스포츠 뉴스면).
 *
 * 대회 결과 기반 자동 기사(AUTO)와 승인 기자 기고(PRESS)를 한 목록으로 보여준다.
 * 종목으로 걸러볼 수 있다. 게시된(PUBLISHED) 기사만 공개 뷰로 나온다.
 */
export const dynamic = 'force-dynamic';

export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sport?: string }>;
}) {
  const { locale: raw } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);
  const base = `/${locale}/news`;

  const sports = await listSports().catch(() => []);
  const sportId = (sp.sport as UUID) || null;
  const items = await listNews({ sportId: sportId ?? undefined, limit: 40 }).catch(() => []);

  const [lead, ...rest] = items;

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.news')} />

      <nav className="flex flex-wrap gap-2">
        <Link
          href={base}
          className={'rounded-full px-3 py-1 text-sm ' + (!sportId ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')}
        >
          {t('search.all')}
        </Link>
        {sports.map((s) => (
          <Link
            key={s.id}
            href={`${base}?sport=${s.id}`}
            className={'rounded-full px-3 py-1 text-sm ' + (sportId === s.id ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')}
          >
            {pick(s.name_i18n, locale)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <div className="space-y-6">
          {/* 헤드라인 */}
          <Link href={`${base}/${lead.slug}`} className="group grid gap-4 sm:grid-cols-2">
            <div className="aspect-video overflow-hidden rounded-lg bg-slate-100">
              {lead.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.cover_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 group-hover:underline wrap-anywhere">
                {pick(lead.title_i18n, locale)}
              </h2>
              {lead.summary_i18n ? (
                <p className="mt-2 text-slate-600">{pick(lead.summary_i18n, locale)}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">
                {lead.byline_i18n ? pick(lead.byline_i18n, locale) : t(`news.source.${lead.source}`)}
                {lead.published_at ? ` · ${lead.published_at.slice(0, 10)}` : ''}
              </p>
            </div>
          </Link>

          {/* 나머지 목록 */}
          {rest.length > 0 ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((n) => (
                <li key={n.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <Link href={`${base}/${n.slug}`} className="group block">
                    <div className="aspect-video bg-slate-100">
                      {n.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.cover_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="p-4">
                      <p className="font-medium text-slate-900 group-hover:underline wrap-anywhere">{pick(n.title_i18n, locale)}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {n.byline_i18n ? pick(n.byline_i18n, locale) : t(`news.source.${n.source}`)}
                        {n.published_at ? ` · ${n.published_at.slice(0, 10)}` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
