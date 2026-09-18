'use client';

import { useState, useTransition } from 'react';
import { flushAction, enqueueRemindersAction } from './actions';

/**
 * 알림 큐 운영 버튼.
 *   - 기한 알림 큐 생성: 발송이 아니라 큐에 쌓기만 한다(안전).
 *   - 큐 발송(flush): 실제 발송이라 되돌릴 수 없다 → 누르기 전에 confirm 으로 한 번 더 확인.
 */
export function NotifyActions({
  locale,
  queued,
  labels,
}: {
  locale: string;
  queued: number;
  labels: {
    enqueue: string; flush: string; flushConfirm: string; working: string;
    flushResult: string; enqueueResult: string; sent: string; failed: string; skipped: string; queuedLabel: string;
  };
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function enqueue() {
    setMsg(null);
    start(async () => {
      const r = await enqueueRemindersAction(locale);
      setMsg(`${labels.enqueueResult}: ${r.queued}`);
    });
  }
  function flush() {
    if (!window.confirm(labels.flushConfirm.replace('{n}', String(queued)))) return;
    setMsg(null);
    start(async () => {
      const r = await flushAction(locale);
      setMsg(`${labels.flushResult} — ${labels.sent}: ${r.sent} · ${labels.failed}: ${r.failed} · ${labels.skipped}: ${r.skipped}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={enqueue} disabled={pending}
        className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
        {pending ? labels.working : labels.enqueue}
      </button>
      <button onClick={flush} disabled={pending || queued === 0}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
        {pending ? labels.working : `${labels.flush} (${queued})`}
      </button>
      {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
    </div>
  );
}
