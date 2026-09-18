'use client';

import { useState } from 'react';
import type { FormWithFields } from '@vsp/core-admin/form-schema';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { FormRenderer, type FormLabels } from '@/components/FormRenderer';
import { confirmIngestAction, rejectIngestAction } from '../actions';

/**
 * 검토·확정 화면 (AI 초안 → 사람 확정 → 전자결재).
 *
 * AI 가 채운 값을 폼에 얹고, 항목마다 추출 신뢰도를 배지로 보여준다.
 * 사람이 확인·수정한 뒤 "확정"하면 신청서가 제출되고 결재가 시작된다. "반려"는 신청서를 만들지 않는다.
 */
export function ReviewForm({
  locale,
  jobId,
  form,
  extracted,
  confidence,
  labels,
  ui,
}: {
  locale: Locale;
  jobId: string;
  form: FormWithFields;
  extracted: Record<string, unknown>;
  confidence: Record<string, number>;
  labels: FormLabels;
  ui: {
    confirmed: string;
    goApprovals: string;
    reviewNeeded: string;
    reject: string;
    rejectConfirm: string;
    failed: string;
  };
}) {
  const [doneId, setDoneId] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (doneId) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">{ui.confirmed}</p>
        <a
          href={`/${locale}/admin/approvals`}
          className="mt-2 inline-block rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
        >
          {ui.goApprovals} →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{failed}</div>
      ) : null}

      <FormRenderer
        form={form}
        locale={locale}
        labels={labels}
        initialData={extracted}
        annotate={(key) => {
          const c = confidence[key];
          if (c === undefined) return null;
          const pct = Math.round(c * 100);
          const tone =
            c >= 0.8 ? 'bg-emerald-50 text-emerald-700'
            : c >= 0.6 ? 'bg-amber-50 text-amber-800'
            : 'bg-red-50 text-red-700';
          return (
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`} title="AI">
              AI {pct}%
            </span>
          );
        }}
        onSubmit={async (data) => {
          setFailed(null);
          const res = await confirmIngestAction(locale, jobId, form.id, data);
          if (res.ok && res.submissionId) {
            setDoneId(res.submissionId);
            return;
          }
          if (res.message) setFailed(`${ui.failed}: ${res.message}`);
          if (res.errors?.length) {
            setFailed(ui.reviewNeeded);
            return { errors: res.errors };
          }
          return;
        }}
      />

      <form action={rejectIngestAction.bind(null, locale)}>
        <input type="hidden" name="job_id" value={jobId} />
        <button className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          {ui.reject}
        </button>
        <span className="ml-2 text-xs text-slate-500">{ui.rejectConfirm}</span>
      </form>
    </div>
  );
}
