'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { receiveAction, respondConcurrenceAction } from './actions';

/** 공문 접수 — 누르면 접수번호가 발번되고 대장에 등재된다 */
export function ReceiveButton({
  dispatchId,
  locale,
  label,
}: {
  dispatchId: string;
  locale: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await receiveAction(dispatchId, locale);
            if (res.ok) router.refresh();
            else setError(res.error ?? 'failed');
          })
        }
        className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {label}
      </button>
      {error ? <span className="ml-2 text-xs text-red-600">{error}</span> : null}
    </>
  );
}

/**
 * 합의 응답.
 * 반대할 때는 의견을 쓰게 한다. 이유 없는 반대는 기안 기관이 판단할 근거가 되지 못한다.
 */
export function ConcurrenceButtons({
  concurrenceId,
  locale,
  labels,
}: {
  concurrenceId: string;
  locale: string;
  labels: { agree: string; disagree: string; opinion: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [opinion, setOpinion] = useState('');
  const [showOpinion, setShowOpinion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function respond(status: 'AGREED' | 'DISAGREED') {
    startTransition(async () => {
      const res = await respondConcurrenceAction(concurrenceId, status, opinion, locale);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'failed');
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showOpinion ? (
        <input
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          value={opinion}
          onChange={(e) => setOpinion(e.target.value)}
          placeholder={labels.opinion}
          autoFocus
        />
      ) : null}
      <button
        disabled={pending}
        onClick={() => respond('AGREED')}
        className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {labels.agree}
      </button>
      <button
        disabled={pending || (showOpinion && !opinion)}
        onClick={() => (showOpinion ? respond('DISAGREED') : setShowOpinion(true))}
        className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {labels.disagree}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
