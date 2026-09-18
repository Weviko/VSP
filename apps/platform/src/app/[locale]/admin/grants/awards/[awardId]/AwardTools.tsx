'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { recordExecutionAction, submitSettlementAction, inspectAction } from '../../actions';

type Tool = 'exec' | 'settle' | 'inspect' | null;

/**
 * 교부건 작업 도구.
 *
 * 세 가지 작업이 교부건의 상태에 따라 순서대로 열린다.
 *   집행 → 정산 제출 → 검사
 * 이미 종결된 건은 아무것도 열지 않는다.
 */
export function AwardTools({
  locale,
  awardId,
  status,
  hasSettlement,
  remaining,
  fundSources,
  labels,
}: {
  locale: string;
  awardId: string;
  status: string;
  hasSettlement: boolean;
  remaining: number;
  fundSources: Array<{ value: string; label: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Tool>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [exec, setExec] = useState({
    executedOn: today, amount: '', fundSource: fundSources[0]?.value ?? 'STATE_BUDGET',
    payee: '', evidenceNo: '',
  });
  const [settle, setSettle] = useState({ returned: '', carried: '' });
  const [inspect, setInspect] = useState({
    result: 'PASS' as 'PASS' | 'CONDITIONAL' | 'FAIL', findings: '', recovery: '',
  });

  const input = 'rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm';
  const btn =
    'rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';
  const ghost = 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100';

  const closed = status === 'CLOSED';
  const canExecute = !closed && status !== 'SETTLING';
  const canSettle = !closed && !hasSettlement;
  const canInspect = !closed && hasSettlement;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setOpen(null);
      router.refresh();
    } else {
      setError(res.error ?? 'failed');
    }
  }

  function errorText(code: string): string {
    if (code.startsWith('OVER:')) {
      const n = Number(code.slice(5)).toLocaleString('vi-VN');
      return locale === 'ko'
        ? `교부 잔액을 초과합니다. 집행 가능액 ${n} ₫`
        : locale === 'en'
          ? `Exceeds remaining balance. Available ${n} ₫`
          : `Vượt quá số dư. Còn có thể chi ${n} ₫`;
    }
    if (code.startsWith('DUP:')) {
      const no = code.slice(4);
      return locale === 'ko'
        ? `증빙 ${no} 이(가) 다른 사업에 이미 사용되었습니다`
        : locale === 'en'
          ? `Evidence ${no} is already used in another award`
          : `Chứng từ ${no} đã được dùng ở khoản khác`;
    }
    return code;
  }

  if (closed) return null;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {open === null ? (
        <div className="flex flex-wrap gap-2">
          {canExecute ? (
            <button className={btn} onClick={() => setOpen('exec')}>
              + {labels.addExecution}
            </button>
          ) : null}
          {canSettle ? (
            <button className={ghost} onClick={() => setOpen('settle')}>
              {labels.submitSettlement}
            </button>
          ) : null}
          {canInspect ? (
            <button className={ghost} onClick={() => setOpen('inspect')}>
              {labels.inspect}
            </button>
          ) : null}
        </div>
      ) : null}

      {open === 'exec' ? (
        <div className="grid gap-3 sm:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.date}</label>
            <input
              type="date"
              className={input + ' w-full'}
              value={exec.executedOn}
              onChange={(e) => setExec({ ...exec, executedOn: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.amount}</label>
            <input
              type="number"
              className={input + ' w-full'}
              value={exec.amount}
              onChange={(e) => setExec({ ...exec, amount: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.fundSource}</label>
            <select
              className={input + ' w-full'}
              value={exec.fundSource}
              onChange={(e) => setExec({ ...exec, fundSource: e.target.value })}
            >
              {fundSources.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.payee}</label>
            <input
              className={input + ' w-full'}
              value={exec.payee}
              onChange={(e) => setExec({ ...exec, payee: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.evidence}</label>
            <input
              className={input + ' w-full font-mono'}
              value={exec.evidenceNo}
              onChange={(e) => setExec({ ...exec, evidenceNo: e.target.value })}
              placeholder="INV-001"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              className={btn}
              disabled={busy || !exec.amount}
              onClick={() =>
                run(() =>
                  recordExecutionAction({
                    awardId, locale,
                    executedOn: exec.executedOn,
                    amount: Number(exec.amount),
                    fundSource: exec.fundSource,
                    payee: exec.payee,
                    evidenceNo: exec.evidenceNo,
                  })
                )
              }
            >
              {labels.save}
            </button>
            <button className={ghost} onClick={() => setOpen(null)}>x</button>
          </div>
        </div>
      ) : null}

      {open === 'settle' ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.returned}</label>
            <input
              type="number"
              className={input + ' w-full'}
              value={settle.returned}
              onChange={(e) => setSettle({ ...settle, returned: e.target.value })}
              placeholder={String(remaining)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.carriedOver}</label>
            <input
              type="number"
              className={input + ' w-full'}
              value={settle.carried}
              onChange={(e) => setSettle({ ...settle, carried: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              className={btn}
              disabled={busy}
              onClick={() =>
                run(() =>
                  submitSettlementAction({
                    awardId, locale,
                    returnedAmount: Number(settle.returned || 0),
                    carriedOverAmount: Number(settle.carried || 0),
                  })
                )
              }
            >
              {labels.save}
            </button>
            <button className={ghost} onClick={() => setOpen(null)}>x</button>
          </div>
        </div>
      ) : null}

      {open === 'inspect' ? (
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.inspect}</label>
            <select
              className={input + ' w-full'}
              value={inspect.result}
              onChange={(e) =>
                setInspect({ ...inspect, result: e.target.value as 'PASS' | 'CONDITIONAL' | 'FAIL' })
              }
            >
              <option value="PASS">PASS</option>
              <option value="CONDITIONAL">CONDITIONAL</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">{labels.findings}</label>
            <input
              className={input + ' w-full'}
              value={inspect.findings}
              onChange={(e) => setInspect({ ...inspect, findings: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.recovery}</label>
            <input
              type="number"
              className={input + ' w-full'}
              value={inspect.recovery}
              onChange={(e) => setInspect({ ...inspect, recovery: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              className={btn}
              disabled={busy}
              onClick={() =>
                run(() =>
                  inspectAction({
                    awardId, locale,
                    result: inspect.result,
                    findings: inspect.findings,
                    recoveryAmount: Number(inspect.recovery || 0),
                  })
                )
              }
            >
              {labels.save}
            </button>
            <button className={ghost} onClick={() => setOpen(null)}>x</button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorText(error)}
        </p>
      ) : null}
    </div>
  );
}
