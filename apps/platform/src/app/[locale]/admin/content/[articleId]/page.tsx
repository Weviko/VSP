import Link from 'next/link';
import { getArticleById, getArticleReviewStatus, t as pick, type UUID } from '@vsp/core-admin';
import { listSports, listEvents } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { updateArticleForm, setArticleStatusForm, submitReviewForm } from '../actions';

export const dynamic = 'force-dynamic';

/** 기사 편집·검수 — 본문 수정 + 상태 전환(초안→검수→게시/숨김). */
export default async function ArticleEditPage({
  params,
}: {
  params: Promise<{ locale: string; articleId: string }>;
}) {
  const { locale: raw, articleId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const article = await getArticleById(articleId as UUID);
  if (!article) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.content')} />
        <EmptyState message={t('common.noData')} />
        <Link href={`/${locale}/admin/content`} className="text-sm text-sky-700 hover:underline">← {t('nav.content')}</Link>
      </div>
    );
  }

  const [sports, events, reviewStatus] = await Promise.all([
    listSports({ onlyActive: true }),
    listEvents({ limit: 50 }),
    getArticleReviewStatus(article.id),
  ]);
  const portalUrl = process.env.VSP_PORTAL_URL ?? 'http://localhost:3000';

  // 상태 전환 버튼 (현재 상태에 맞는 다음 단계만). REVIEW 는 전자결재선으로 보낸다(별도 버튼).
  const transitions: Array<{ to: string; label: string; primary?: boolean }> = [];
  if (article.status !== 'PUBLISHED') transitions.push({ to: 'PUBLISHED', label: t('content.publish'), primary: true });
  if (article.status === 'PUBLISHED') transitions.push({ to: 'HIDDEN', label: t('content.hide') });
  if (article.status === 'REVIEW' || article.status === 'HIDDEN') transitions.push({ to: 'DRAFT', label: t('content.toDraft') });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/${locale}/admin/content`} className="text-sm text-sky-700 hover:underline">← {t('nav.content')}</Link>
        <div className="flex items-center gap-2">
          <Badge tone={statusTone(article.status)}>{t(`status.${article.status}`)}</Badge>
          <Badge>{t(`news.source.${article.source}`)}</Badge>
        </div>
      </div>

      <PageHeader title={pick(article.title_i18n, locale) || t('content.newArticle')} />

      {/* 검수 결재 상태 */}
      {reviewStatus ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {t('content.reviewState')}: <Badge tone={statusTone(reviewStatus)}>{t(`status.${reviewStatus}`)}</Badge>
          {reviewStatus === 'APPROVED' ? <span className="ml-2 text-emerald-700">{t('content.reviewApproved')}</span> : null}
          {reviewStatus === 'REJECTED' ? <span className="ml-2 text-red-700">{t('content.reviewRejected')}</span> : null}
        </div>
      ) : null}

      {/* 상태 전환 + 검수요청 + 공개보기 */}
      <div className="flex flex-wrap items-center gap-2">
        {article.status === 'DRAFT' ? (
          <form action={submitReviewForm.bind(null, locale, article.id)}>
            <button className="rounded border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-100">{t('content.toReview')}</button>
          </form>
        ) : null}
        {transitions.map((tr) => (
          <form key={tr.to} action={setArticleStatusForm.bind(null, locale, article.id)}>
            <input type="hidden" name="status" value={tr.to} />
            <button className={
              'rounded px-3 py-1.5 text-sm font-medium ' +
              (tr.primary ? 'bg-slate-900 text-white hover:bg-slate-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
            }>{tr.label}</button>
          </form>
        ))}
        {article.status === 'PUBLISHED' ? (
          <a href={`${portalUrl}/${locale}/news/${article.slug}`} target="_blank" rel="noreferrer" className="ml-auto text-sm text-sky-700 hover:underline">
            {t('content.viewPublic')} ↗
          </a>
        ) : null}
      </div>

      {/* 본문 편집 (현재 언어) */}
      <Card>
        <form action={updateArticleForm.bind(null, locale, article.id)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-700">{t('content.articleTitle')}</label>
            <input name="title" defaultValue={pick(article.title_i18n, locale)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-700">{t('content.summary')}</label>
            <textarea name="summary" rows={2} defaultValue={article.summary_i18n ? pick(article.summary_i18n, locale) : ''} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-700">{t('content.body')}</label>
            <textarea name="body" rows={10} defaultValue={article.body_i18n ? pick(article.body_i18n, locale) : ''} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-700">{t('content.cover')}</label>
              <input name="cover_url" defaultValue={article.cover_url ?? ''} placeholder="https://…" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">{t('content.tags')}</label>
              <input name="tags" defaultValue={article.tags?.join(', ') ?? ''} placeholder="a, b, c" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">{t('nav.sports')}</label>
              <select name="sport_id" defaultValue={article.sport_id ?? ''} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{pick(s.name_i18n, locale)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700">{t('event.detail')}</label>
              <select name="event_id" defaultValue={article.event_id ?? ''} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                {events.map((e) => <option key={e.id} value={e.id}>{pick(e.name_i18n, locale)}</option>)}
              </select>
            </div>
          </div>
          <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
        </form>
      </Card>
    </div>
  );
}
