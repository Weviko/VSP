'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createFeeRuleAction, createOrderAction, recordCashAction } from './actions';

/** 요금 규칙 등록 + 수납 건 생성 */
export function PaymentTools({
  locale,
  orgs,
  labels,
}: {
  locale: string;
  orgs: Array<{ id: string; label: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [rule, setRule] = useState({ orgId: orgs[0]?.id ?? '', code: 'ATHLETE_REG', nameVi: '', amount: '' });
  const [order, setOrder] = useState({ payeeOrgId: orgs[0]?.id ?? '', amount: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';
  const btn =
    'rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setMsg(ok);
      router.refresh();
    } else {
      setError(res.error ?? 'failed');
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.payee}</label>
          <select
            className={input}
            value={rule.orgId}
            onChange={(e) => setRule({ ...rule, orgId: e.target.value })}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Code</label>
          <input
            className={input + ' w-36'}
            value={rule.code}
            onChange={(e) => setRule({ ...rule, code: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.name}</label>
          <input
            className={input}
            value={rule.nameVi}
            onChange={(e) => setRule({ ...rule, nameVi: e.target.value })}
            placeholder="Phí đăng ký VĐV"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.amount} (VND)</label>
          <input
            type="number"
            className={input + ' w-36'}
            value={rule.amount}
            onChange={(e) => setRule({ ...rule, amount: e.target.value })}
            placeholder="200000"
          />
        </div>
        <button
          className={btn}
          disabled={busy || !rule.nameVi || !rule.amount}
          onClick={() =>
            run(
              () =>
                createFeeRuleAction({
                  orgId: rule.orgId, code: rule.code, nameVi: rule.nameVi,
                  amount: Number(rule.amount), locale,
                }),
              'fee rule created'
            )
          }
        >
          + {labels.createRule}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.payee}</label>
          <select
            className={input}
            value={order.payeeOrgId}
            onChange={(e) => setOrder({ ...order, payeeOrgId: e.target.value })}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.amount} (VND)</label>
          <input
            type="number"
            className={input + ' w-36'}
            value={order.amount}
            onChange={(e) => setOrder({ ...order, amount: e.target.value })}
            placeholder="200000"
          />
        </div>
        <button
          className={btn}
          disabled={busy || !order.amount}
          onClick={() =>
            run(
              () =>
                createOrderAction({
                  payeeOrgId: order.payeeOrgId, amount: Number(order.amount), locale,
                }),
              'order created'
            )
          }
        >
          + {labels.order}
        </button>
      </div>

      {msg ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.startsWith('FEE_CAP_EXCEEDED')
            ? `exceeds central cap: ${error.split(':')[1]}`
            : error}
        </p>
      ) : null}
    </div>
  );
}

/** 목록 행에서 바로 현금 수납을 기록한다 */
export function CashButton({
  orderId,
  locale,
  label,
}: {
  orderId: string;
  locale: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await recordCashAction(orderId, locale);
          router.refresh();
        })
      }
      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
