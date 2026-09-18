'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addMemberAction } from '../actions';

/**
 * 조직에 사람을 배치한다.
 * 전화번호로 기존 인물을 찾고 없으면 새로 만든다.
 * 권한은 사람이 아니라 역할에 붙으므로, 담당자가 바뀌어도 결재선이 끊기지 않는다.
 */
export function MemberForm({
  orgId,
  locale,
  roles,
  labels,
}: {
  orgId: string;
  locale: string;
  roles: Array<{ code: string; label: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', roleCode: 'ORG_STAFF', title: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
      >
        + {labels.add}
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addMemberAction({ orgId, locale, ...form });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setForm({ fullName: '', phone: '', roleCode: 'ORG_STAFF', title: '' });
      router.refresh();
    } else {
      setError(res.error ?? 'failed');
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs text-slate-600">{labels.name}</label>
        <input
          className={input}
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-600">{labels.phone}</label>
        <input
          className={input}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="0912345678"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-600">{labels.role}</label>
        <select
          className={input}
          value={form.roleCode}
          onChange={(e) => setForm({ ...form, roleCode: e.target.value })}
        >
          {roles.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          disabled={busy || !form.fullName}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {labels.save}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          x
        </button>
      </div>
      {error ? <p className="text-sm text-red-600 sm:col-span-4">{error}</p> : null}
    </form>
  );
}
