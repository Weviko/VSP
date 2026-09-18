'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createFormAction } from './actions';

export function NewFormButton({ locale, label }: { locale: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', titleVi: '', slaDays: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        + {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3">
      <input
        className={input + ' w-36 font-mono'}
        placeholder="ATHLETE_REG"
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
      />
      <input
        className={input}
        placeholder="Đơn đăng ký..."
        value={form.titleVi}
        onChange={(e) => setForm({ ...form, titleVi: e.target.value })}
      />
      <input
        className={input + ' w-24'}
        type="number"
        placeholder="SLA일"
        value={form.slaDays}
        onChange={(e) => setForm({ ...form, slaDays: e.target.value })}
      />
      <button
        disabled={busy || !form.code || !form.titleVi}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await createFormAction({
            code: form.code,
            titleVi: form.titleVi,
            slaDays: form.slaDays ? Number(form.slaDays) : null,
            locale,
          });
          setBusy(false);
          if (res.ok && res.id) router.push(`/${locale}/admin/settings/forms/${res.id}`);
          else setError(res.error ?? 'failed');
        }}
        className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        생성
      </button>
      <button
        onClick={() => setOpen(false)}
        className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
      >
        x
      </button>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
