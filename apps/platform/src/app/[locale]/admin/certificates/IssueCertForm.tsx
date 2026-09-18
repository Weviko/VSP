'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { issueCertAction } from './actions';

const CERT_TYPES = ['ATHLETE_REG', 'COACH_REG', 'REFEREE_REG', 'CAREER', 'AWARD'];

export function IssueCertForm({
  locale,
  orgs,
  labels,
}: {
  locale: string;
  orgs: Array<{ id: string; label: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    personName: '', orgId: orgs[0]?.id ?? '', certType: CERT_TYPES[0],
  });
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.name}</label>
          <input
            className={input}
            value={form.personName}
            onChange={(e) => setForm({ ...form, personName: e.target.value })}
            placeholder="Nguyen Van A"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.type}</label>
          <select
            className={input}
            value={form.certType}
            onChange={(e) => setForm({ ...form, certType: e.target.value })}
          >
            {CERT_TYPES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.org}</label>
          <select
            className={input}
            value={form.orgId}
            onChange={(e) => setForm({ ...form, orgId: e.target.value })}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          disabled={busy || !form.personName}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setIssued(null);
            const res = await issueCertAction({ ...form, locale });
            setBusy(false);
            if (res.ok && res.verifyCode) {
              setIssued(res.verifyCode);
              router.refresh();
            } else {
              setError(res.error ?? 'failed');
            }
          }}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {labels.issue}
        </button>
      </div>

      {issued ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {labels.code}: <span className="font-mono font-bold">{issued}</span>
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
