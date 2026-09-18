'use client';

import { useState, useTransition } from 'react';
import type { ActionType } from '@vsp/core-admin/workflow-types';
import { actOnApproval } from './actions';

/**
 * 결재 한 건.
 * 법정 기한이 지난 건은 시각적으로 강하게 구분한다.
 * 대회 개최 승인이 10일을 넘기면 단순 지연이 아니라 법 위반이 되기 때문이다.
 */
export function ApprovalRow({
  locale,
  instanceId,
  formTitle,
  stepName,
  stepNo,
  submittedAt,
  dueAt,
  overdue,
  labels,
}: {
  locale: string;
  instanceId: string;
  formTitle: string;
  stepName: string;
  stepNo: number;
  submittedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  labels: { approve: string; reject: string; return: string };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ActionType | null>(null);

  function run(action: ActionType) {
    setError(null);
    startTransition(async () => {
      const res = await actOnApproval(instanceId, action, locale);
      if (res.ok) setDone(action);
      else setError(res.error ?? 'failed');
    });
  }

  if (done) return null;

  return (
    <li
      className={
        'rounded-lg border bg-white p-4 ' +
        (overdue ? 'border-red-300 bg-red-50/40' : 'border-slate-200')
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 wrap-anywhere">{formTitle}</p>
          <p className="mt-0.5 text-sm text-slate-600">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">step {stepNo}</span>
            <span className="ml-2">{stepName}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {submittedAt ? new Date(submittedAt).toLocaleString(locale) : '—'}
            {dueAt ? (
              <span className={overdue ? 'ml-2 font-semibold text-red-600' : 'ml-2'}>
                due {new Date(dueAt).toLocaleDateString(locale)}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => run('APPROVE')}
            disabled={pending}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {labels.approve}
          </button>
          <button
            onClick={() => run('RETURN')}
            disabled={pending}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {labels.return}
          </button>
          <button
            onClick={() => run('REJECT')}
            disabled={pending}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {labels.reject}
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </li>
  );
}
