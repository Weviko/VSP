import Link from 'next/link';
import { listArticles, listPressCredentials, t as pick, type ArticleStatus, type UUID } from '@vsp/core-admin';
import { listEvents } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, EmptyState, Table, Tr, Td, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireWorkspace, currentUser } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import {
  createArticleForm, deleteArticleForm, generateResultArticleForm,
  issueCredentialForm, setCredentialStatusForm, updateCredentialForm, searchPersonsAction,
} from './actions';

export const dynamic = 'force-dynamic';

const STATUSES: ArticleStatus[] = ['DRAFT', 'REVIEW', 'PUBLISHED', 'HIDDEN'];

/**
 * 콘텐츠 행정 — 기사 작성·검수 + 결과 자동기사 + 기자 자격.
 * (기존 자리표시를 실제 기능으로 교체)
 */
export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale: raw } = await params;
  const { status: statusRaw } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { dbError } = await currentUser();

  if (dbError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t('nav.content')}</h1>
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const status = STATUSES.includes(statusRaw as ArticleStatus) ? (statusRaw as ArticleStatus) : undefined;
  const [articles, credentials, events] = await Promise.all([
    listArticles({ status }),
    listPressCredentials(),
    listEvents({ limit: 50 }),
  ]);

  const base = `/${locale}/admin/content`;

  return (
    <div className="space-y-8">
      <PageHeader title={t('nav.content')} subtitle={t('content.subtitle')} />

      {/* 새 기사 / 결과 자동생성 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('content.newArticle')}</h2>
          <form action={createArticleForm.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <input name="title" required placeholder={t('content.articleTitle')} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
            <select name="source" defaultValue="ORG" className="rounded border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="ORG">{t('news.source.ORG')}</option>
              <option value="PRESS">{t('news.source.PRESS')}</option>
              <option value="PARTNER">{t('news.source.PARTNER')}</option>
            </select>
            <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.add')}</button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('content.autoArticle')}</h2>
          <form action={generateResultArticleForm.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <select name="event_id" defaultValue="" required className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="" disabled>{t('content.pickEvent')}</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{pick(e.name_i18n, locale)}</option>
              ))}
            </select>
            <button className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">{t('content.generate')}</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t('content.autoHint')}</p>
        </Card>
      </div>

      {/* 기사 목록 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{t('content.articles')}</h2>
          <nav className="flex flex-wrap gap-1">
            <Link href={base} className={'rounded px-2.5 py-1 text-sm ' + (!status ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100')}>{t('search.all')}</Link>
            {STATUSES.map((s) => (
              <Link key={s} href={`${base}?status=${s}`} className={'rounded px-2.5 py-1 text-sm ' + (status === s ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100')}>
                {t(`status.${s}`)}
              </Link>
            ))}
          </nav>
        </div>

        {articles.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('content.articleTitle'), t('content.source'), t('common.status'), t('common.createdAt'), '']}>
            {articles.map((a) => (
              <Tr key={a.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">{pick(a.title_i18n, locale)}</Td>
                <Td className="text-slate-600">{t(`news.source.${a.source}`)}</Td>
                <Td><Badge tone={statusTone(a.status)}>{t(`status.${a.status}`)}</Badge></Td>
                <Td className="whitespace-nowrap tabular-nums text-slate-500">{a.updated_at.slice(0, 10)}</Td>
                <Td className="whitespace-nowrap">
                  <Link href={`${base}/${a.id}`} className="text-sm font-medium text-sky-700 hover:underline">{t('common.edit')}</Link>
                  <form action={deleteArticleForm.bind(null, locale)} className="ml-3 inline">
                    <input type="hidden" name="article_id" value={a.id} />
                    <button className="text-sm text-slate-400 hover:text-red-600">{t('common.delete')}</button>
                  </form>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 기자 자격 */}
      <section id="press" className="space-y-3 scroll-mt-20">
        <h2 className="text-lg font-semibold text-slate-900">{t('content.press')}</h2>

        <Card>
          <form action={issueCredentialForm.bind(null, locale)} className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto] sm:items-end">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.pressPerson')}</span>
              <PersonPicker
                name="person_id"
                required
                onSearch={searchPersonsAction.bind(null, locale)}
                labels={{
                  search: t('picker.search'),
                  noResults: t('picker.noResults'),
                  minChars: t('picker.minChars'),
                  change: t('picker.change'),
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.credentialNo')}</span>
              <input name="credential_no" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('content.validTo')}</span>
              <input name="valid_to" type="date" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('content.issue')}</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t('content.pressHint')}</p>
        </Card>

        {credentials.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('content.pressPerson'), t('content.credentialNo'), t('content.validTo'), t('common.status'), '']}>
            {credentials.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium text-slate-900">{c.person_name ?? c.person_id.slice(0, 8)}</Td>
                <Td className="font-mono text-xs text-slate-500">{c.credential_no ?? '—'}</Td>
                <Td className="tabular-nums text-slate-500">{c.valid_to ?? '—'}</Td>
                <Td><Badge tone={statusTone(c.status)}>{t(`status.${c.status}`)}</Badge></Td>
                <Td>
                  <div className="flex items-center gap-3">
                    {c.status === 'ACTIVE' ? (
                      <form action={setCredentialStatusForm.bind(null, locale)}>
                        <input type="hidden" name="credential_id" value={c.id} />
                        <input type="hidden" name="status" value="SUSPENDED" />
                        <button className="text-sm text-amber-700 hover:underline">{t('content.suspend')}</button>
                      </form>
                    ) : (
                      <form action={setCredentialStatusForm.bind(null, locale)}>
                        <input type="hidden" name="credential_id" value={c.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <button className="text-sm text-emerald-700 hover:underline">{t('content.reactivate')}</button>
                      </form>
                    )}
                    <details>
                      <summary className="cursor-pointer text-sm text-sky-700">{t('common.edit')}</summary>
                      <form action={updateCredentialForm.bind(null, locale)} className="mt-2 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="credential_id" value={c.id} />
                        <input name="credential_no" defaultValue={c.credential_no ?? ''} placeholder={t('content.credentialNo')} className="w-32 rounded border border-slate-300 px-2 py-1 text-sm" />
                        <input name="valid_to" type="date" defaultValue={c.valid_to ?? ''} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                        <button className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
                      </form>
                    </details>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
