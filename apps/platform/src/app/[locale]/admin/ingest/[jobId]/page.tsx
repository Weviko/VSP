import Link from 'next/link';
import { getIngestionJob, getFormById, t as pick, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { ReviewForm } from './ReviewForm';

export const dynamic = 'force-dynamic';

/**
 * AI 서류 등록 — 한 건 검토·확정.
 *
 * 원본 서류를 옆에 두고, AI 가 채운 공식 폼 초안을 항목별 신뢰도와 함께 검토한다.
 * 확정하면 신청서 제출 + 전자결재 시작. AI 는 초안만 만들 뿐 승인하지 않는다.
 */
export default async function IngestReviewPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale: raw, jobId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const job = await getIngestionJob(jobId as UUID);
  if (!job) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('nav.ingest')} />
        <EmptyState message={t('common.noData')} />
        <Link href={`/${locale}/admin/ingest`} className="text-sm text-sky-700 hover:underline">← {t('nav.ingest')}</Link>
      </div>
    );
  }

  const form = await getFormById(job.form_id);
  const conf = job.overall_confidence == null ? null : Number(job.overall_confidence);
  const alreadyDone = job.status !== 'EXTRACTED';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/ingest`} className="text-sm text-sky-700 hover:underline">← {t('nav.ingest')}</Link>
      </div>

      <PageHeader
        title={form ? pick(form.title_i18n, locale) : t('nav.ingest')}
        subtitle={t('ingest.reviewSubtitle')}
        right={
          <div className="flex items-center gap-2">
            <Badge tone={conf == null ? 'red' : conf >= 0.8 ? 'green' : conf >= 0.6 ? 'amber' : 'red'}>
              AI {conf == null ? '—' : `${Math.round(conf * 100)}%`}
            </Badge>
            <a
              href={`/api/files/${job.attachment_id}`}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {t('ingest.original')}
            </a>
          </div>
        }
      />

      {alreadyDone ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          {t('ingest.alreadyProcessed')} — <Badge tone={job.status === 'APPLIED' ? 'green' : 'red'}>{t(`status.${job.status}`)}</Badge>
          {job.submission_id ? (
            <Link href={`/${locale}/admin/approvals`} className="ml-2 text-sky-700 hover:underline">{t('ingest.goApprovals')} →</Link>
          ) : null}
        </div>
      ) : !form ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <>
          <p className="rounded bg-sky-50 px-4 py-3 text-sm text-sky-900">{t('ingest.safety')}</p>
          <ReviewForm
            locale={locale}
            jobId={job.id}
            form={form}
            extracted={job.extracted}
            confidence={job.confidence}
            labels={{
              submit: t('ingest.confirm'),
              required: t('common.required'),
              upload: t('common.upload'),
              uploading: t('common.uploading'),
              remove: t('common.delete'),
              fileTooLarge: t('common.fileTooLarge'),
              fileBadType: t('common.fileBadType'),
            }}
            ui={{
              confirmed: t('ingest.confirmed'),
              goApprovals: t('ingest.goApprovals'),
              reviewNeeded: t('ingest.reviewNeeded2'),
              reject: t('ingest.reject'),
              rejectConfirm: t('ingest.rejectHint'),
              failed: t('ingest.failed'),
            }}
          />
        </>
      )}
    </div>
  );
}
