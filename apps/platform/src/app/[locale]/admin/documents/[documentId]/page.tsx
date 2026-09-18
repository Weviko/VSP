import Link from 'next/link';
import { getDocument, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { OrgPicker } from '@/components/OrgPicker';
import { requestConcurrenceForm, searchOrgsAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * 공문 상세 — 기안 내용 확인 + 관련 기관 합의 요청.
 * (문서 대장 링크가 이 화면으로 온다. 접수·회신은 목록 화면의 도구로 처리.)
 */
export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; documentId: string }>;
}) {
  const { locale: raw, documentId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const doc = await getDocument(documentId as UUID);
  if (!doc) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('doc.title')} />
        <EmptyState message={t('common.noData')} />
        <Link href={`/${locale}/admin/documents`} className="text-sm text-sky-700 hover:underline">← {t('doc.title')}</Link>
      </div>
    );
  }

  const facts: Array<[string, string]> = [
    [t('doc.docNo'), doc.doc_no],
    [t('doc.docType'), doc.doc_type ?? '—'],
    [t('common.status'), doc.doc_kind ?? '—'],
    [t('doc.replyDue'), doc.issued_at ? doc.issued_at.slice(0, 10) : '—'],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/documents`} className="text-sm text-sky-700 hover:underline">← {t('doc.title')}</Link>
      </div>
      <PageHeader title={doc.title} subtitle={doc.doc_no} />

      <Card>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-slate-800 wrap-anywhere">{v}</dd>
            </div>
          ))}
        </dl>
        {doc.body ? (
          <div className="mt-4 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-800">{doc.body}</div>
        ) : null}
      </Card>

      {/* 합의 요청 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t('doc.requestConcurrence')}</h2>
        <Card>
          <form action={requestConcurrenceForm.bind(null, locale, doc.id)} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <span className="mb-1 block text-sm text-slate-600">{t('doc.recipient')}</span>
              <OrgPicker
                name="org_id"
                required
                onSearch={searchOrgsAction.bind(null, locale)}
                labels={{ search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') }}
              />
            </div>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('doc.requestConcurrence')}</button>
          </form>
        </Card>
      </section>
    </div>
  );
}
