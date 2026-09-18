'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { decideAwardAction } from '../../actions';

/**
 * 신청 한 건에 대한 교부 결정.
 * 신청액을 기본값으로 채워두되 심사 결과에 따라 줄일 수 있게 한다.
 */
export function AwardDecider({
  locale,
  programId,
  applicationId,
  granteeOrgId,
  defaultAmount,
  defaultSelfFunding,
  labels,
}: {
  locale: string;
  programId: string;
  applicationId: string;
  granteeOrgId: string;
  defaultAmount: string;
  defaultSelfFunding: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    amount: String(Math.round(Number(defaultAmount))),
    selfFunding: String(Math.round(Number(defaultSelfFunding))),
    decisionNo: '',
    account: '',
    dueOn: '',
  });

  const input = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
      >
        {labels.decide}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-1.5">
      <input
        className={input + ' w-28'}
        type="number"
        value={f.amount}
        onChange={(e) => setF({ ...f, amount: e.target.value })}
        placeholder={labels.amount}
      />
      <input
        className={input + ' w-28 font-mono'}
        value={f.decisionNo}
        onChange={(e) => setF({ ...f, decisionNo: e.target.value })}
        placeholder="01/QD"
      />
      <input
        className={input + ' w-32'}
        type="date"
        value={f.dueOn}
        onChange={(e) => setF({ ...f, dueOn: e.target.value })}
      />
      <button
        disabled={busy || !f.amount}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await decideAwardAction({
            programId, applicationId, granteeOrgId, locale,
            awardedAmount: Number(f.amount),
            selfFunding: Number(f.selfFunding || 0),
            decisionNo: f.decisionNo,
            dedicatedAccount: f.account,
            settlementDueOn: f.dueOn,
          });
          setBusy(false);
          if (res.ok) {
            setOpen(false);
            router.refresh();
          } else {
            setError(res.error ?? 'failed');
          }
        }}
        className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {labels.save}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
      >
        x
      </button>
      {error ? <p className="w-full text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
