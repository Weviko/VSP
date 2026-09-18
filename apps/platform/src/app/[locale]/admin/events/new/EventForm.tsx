'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { createEventAction } from '../actions';

const LEVELS = [
  { value: 'NATIONAL', label: 'National' },
  { value: 'PROVINCIAL', label: 'Provincial' },
  { value: 'CLUB', label: 'Club' },
  { value: 'INTERNATIONAL', label: 'International' },
];

export function EventForm({
  locale,
  sports,
  orgs,
  labels,
}: {
  locale: Locale;
  sports: Array<{ id: string; label: string }>;
  orgs: Array<{ id: string; label: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    nameVi: '', nameKo: '', sportId: sports[0]?.id ?? '', hostOrgId: orgs[0]?.id ?? '',
    eventLevel: 'NATIONAL', startsOn: '', endsOn: '', venueText: '', entryClosesAt: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createEventAction({
      ...form,
      sportId: form.sportId || null,
      locale,
    });
    setBusy(false);
    if (res.ok && res.id) router.push(`/${locale}/admin/events/${res.id}`);
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
          onChange={(e) => setForm({ ...form, nameVi: e.target.value })}
          placeholder="Giải vô địch quốc gia 2026"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{labels.name} (ko)</label>
        <input
          className={input}
          value={form.nameKo}
          onChange={(e) => setForm({ ...form, nameKo: e.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.sport}</label>
          <select
            className={input}
            value={form.sportId}
            onChange={(e) => setForm({ ...form, sportId: e.target.value })}
          >
            <option value="">—</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.level}</label>
          <select
            className={input}
            value={form.eventLevel}
            onChange={(e) => setForm({ ...form, eventLevel: e.target.value })}
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {labels.host} <span className="text-red-500">*</span>
        </label>
        <select
          className={input}
          value={form.hostOrgId}
          onChange={(e) => setForm({ ...form, hostOrgId: e.target.value })}
          required
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {labels.period} (start) <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className={input}
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {labels.period} (end) <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className={input}
            value={form.endsOn}
            onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.venue}</label>
          <input
            className={input}
            value={form.venueText}
            onChange={(e) => setForm({ ...form, venueText: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.entryCloses}</label>
          <input
            type="date"
            className={input}
            value={form.entryClosesAt}
            onChange={(e) => setForm({ ...form, entryClosesAt: e.target.value })}
          />
        </div>
      </div>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !form.nameVi || !form.startsOn || !form.endsOn}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {labels.save}
      </button>
    </form>
  );
}
