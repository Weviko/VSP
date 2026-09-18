import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Badge } from '@vsp/web-shared/ui';

/**
 * 기사 상세.
 *
 * 게시된 기사만 보인다(공개 뷰). 자동 생성(AUTO)과 기자 기고(PRESS)를 배지로 구분해
 * 독자가 출처를 알 수 있게 한다. 본문은 문단 단위로 그린다.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const a = await getArticle(slug).catch(() => null);
  return a ? { title: pick(a.title_i18n, locale) } : {};
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const a = await getArticle(slug);
  if (!a) notFound();

  const body = a.body_i18n ? pick(a.body_i18n, locale) : '';
  const paras = body.split(/\n{2,}/).filter(Boolean);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/news`} className="text-sm text-sky-700 hover:underline">← {t('nav.news')}</Link>
      </div>

      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone={a.source === 'AUTO' ? 'blue' : 'neutral'}>{t(`news.source.${a.source}`)}</Badge>
          {a.published_at ? <span className="text-sm text-slate-400 tabular-nums">{a.published_at.slice(0, 10)}</span> : null}
        </div>
        <h1 className="text-2xl font-bold text-slate-900 wrap-anywhere">{pick(a.title_i18n, locale)}</h1>
        {a.byline_i18n ? <p className="text-sm text-slate-500">{pick(a.byline_i18n, locale)}</p> : null}
      </header>

      {a.cover_url ? (
        <div className="overflow-hidden rounded-lg bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.cover_url} alt="" className="w-full object-cover" />
        </div>
      ) : null}

      {a.summary_i18n ? (
        <p className="border-l-4 border-slate-200 pl-4 text-lg text-slate-700">{pick(a.summary_i18n, locale)}</p>
      ) : null}

      <div className="space-y-4 leading-relaxed text-slate-800">
        {paras.length > 0 ? (
          paras.map((p, i) => <p key={i} className="wrap-anywhere">{p}</p>)
        ) : (
          <p className="text-slate-400">{t('common.noData')}</p>
        )}
      </div>

      {a.tags && a.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {a.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">#{tag}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
