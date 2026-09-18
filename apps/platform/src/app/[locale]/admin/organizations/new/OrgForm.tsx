'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { createOrgAction } from '../actions';

export function OrgForm({
  locale,
  parents,
  levels,
  labels,
}: {
  locale: Locale;
  parents: Array<{ id: string; label: string }>;
  levels: Array<{ code: string; label: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    nameVi: '', nameEn: '', nameKo: '',
    levelType: levels[0]?.code ?? '', parentId: '', displayId: '', regionCode: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createOrgAction({ ...form, locale });
    setBusy(false);
    if (res.ok) router.push(`/${locale}/admin/organizations`);
    else setError(res.error ?? 'failed');
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {labels.name} (vi) <span className="text-red-500">*</span>
        </label>
        <input
          className={input}
          value={form.nameVi}
          onChange={(e) => set('nameVi', e.target.value)}
          placeholder="Liên đoàn ..."
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.name} (en)</label>
          <input className={input} value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.name} (ko)</label>
          <input className={input} value={form.nameKo} onChange={(e) => set('nameKo', e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {labels.levelType} <span className="text-red-500">*</span>
          </label>
          <select className={input} value={form.levelType} onChange={(e) => set('levelType', e.target.value)}>
            {levels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.parent}</label>
          <select className={input} value={form.parentId} onChange={(e) => set('parentId', e.target.value)}>
            <option value="">—</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
          <input className={input} value={form.displayId} onChange={(e) => set('displayId', e.target.value)} placeholder="FED-TKD" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.region}</label>
          <input className={input} value={form.regionCode} onChange={(e) => set('regionCode', e.target.value)} placeholder="HN" />
        </div>
      </div>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !form.nameVi}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {labels.save}
      </button>
    </form>
  );
}
