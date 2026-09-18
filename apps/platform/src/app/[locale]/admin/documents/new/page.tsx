import Link from 'next/link';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { OrgPicker } from '@/components/OrgPicker';
import { createDispatchForm, searchOrgsAction } from '../actions';

export const dynamic = 'force-dynamic';

const DOC_TYPES = ['OFFICIAL_LETTER', 'DECISION', 'REPORT', 'PLAN'];

/**
 * 공문 기안+시행 — 제목·본문·수신 기관을 정해 발송한다.
 * 기안 기관은 로그인 사용자의 활동 조직. 발송과 동시에 생산 대장에 등재된다(sendDocument).
 */
export default async function NewDocumentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/documents`} className="text-sm text-sky-700 hover:underline">← {t('doc.title')}</Link>
      </div>
      <PageHeader title={t('doc.newDoc')} />

      <Card>
        <form action={createDispatchForm.bind(null, locale)} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('doc.subject')}</span>
            <input name="title" required className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('doc.body')}</span>
            <textarea name="body" rows={6} className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('doc.docType')}</span>
              <select name="doc_type" defaultValue="OFFICIAL_LETTER" className={input}>
                {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('doc.replyDue')}</span>
              <input type="date" name="reply_due_on" className={input} />
            </label>
          </div>
          <div className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('doc.recipient')}</span>
            <OrgPicker
              name="to_org_id"
              required
              onSearch={searchOrgsAction.bind(null, locale)}
              labels={{ search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') }}
            />
          </div>
          <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('doc.send')}</button>
        </form>
      </Card>
    </div>
  );
}
