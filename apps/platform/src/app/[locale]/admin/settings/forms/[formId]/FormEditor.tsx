'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  saveFieldAction, deleteFieldAction, moveFieldAction,
  cloneFormAction, setFormStatusAction,
} from '../../actions';

const TYPES = [
  'text', 'textarea', 'number', 'date', 'select',
  'checkbox', 'file', 'person', 'org',
] as const;

interface FieldRow {
  id: string;
  field_key: string;
  label: string;
  labelVi: string;
  data_type: string;
  is_required: boolean;
  section: string | null;
  sort_order: number;
  options: string;
}

/**
 * 서식 편집기.
 *
 * 운영 중(ACTIVE)인 서식은 편집을 막는다. 이미 제출된 신청서가 그 정의를 참조하므로
 * 필드를 바꾸면 과거 기록의 의미가 달라진다. 대신 새 버전을 만들어 수정하게 한다.
 */
export function FormEditor({
  locale,
  formId,
  status,
  fields,
  labels,
}: {
  locale: string;
  formId: string;
  status: string;
  fields: FieldRow[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = status === 'ACTIVE';

  function run(fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, go?: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? 'failed');
      if (go && res.id) router.push(`/${locale}/admin/settings/forms/${res.id}`);
      else router.refresh();
    });
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    run(() => moveFieldAction(formId, next.map((f) => f.id), locale));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {locked ? (
          <>
            <span className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
              {labels.locked}
            </span>
            <button
              disabled={pending}
              onClick={() => run(() => cloneFormAction(formId, locale), true)}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {labels.clone}
            </button>
          </>
        ) : (
          <button
            disabled={pending}
            onClick={() => run(() => setFormStatusAction(formId, 'ACTIVE', locale))}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {labels.activate}
          </button>
        )}
      </div>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="w-20 px-3 py-2 text-xs font-medium">{labels.section}</th>
              <th className="px-3 py-2 text-xs font-medium">{labels.label}</th>
              <th className="px-3 py-2 text-xs font-medium">{labels.fieldKey}</th>
              <th className="px-3 py-2 text-xs font-medium">{labels.type}</th>
              <th className="px-3 py-2 text-xs font-medium">{labels.required}</th>
              <th className="w-28 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {fields.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {labels.empty}
                </td>
              </tr>
            ) : (
              fields.map((f, i) =>
                editing === f.id ? (
                  <tr key={f.id} className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={6} className="p-3">
                      <FieldForm
                        formId={formId}
                        locale={locale}
                        initial={f}
                        labels={labels}
                        onDone={() => {
                          setEditing(null);
                          router.refresh();
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-xs text-slate-500">{f.section ?? '-'}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{f.label}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{f.field_key}</td>
                    <td className="px-3 py-2 text-slate-600">{f.data_type}</td>
                    <td className="px-3 py-2">
                      {f.is_required ? <span className="text-red-600">●</span> : <span className="text-slate-300">○</span>}
                    </td>
                    <td className="px-3 py-2">
                      {!locked ? (
                        <span className="flex gap-1">
                          <button onClick={() => move(i, -1)} disabled={pending || i === 0}
                            className="rounded border border-slate-300 px-1.5 text-xs text-slate-600 disabled:opacity-30">↑</button>
                          <button onClick={() => move(i, 1)} disabled={pending || i === fields.length - 1}
                            className="rounded border border-slate-300 px-1.5 text-xs text-slate-600 disabled:opacity-30">↓</button>
                          <button onClick={() => setEditing(f.id)}
                            className="rounded border border-slate-300 px-2 text-xs text-slate-700">{labels.edit}</button>
                          <button
                            onClick={() => run(() => deleteFieldAction(f.id, formId, locale))}
                            className="rounded border border-red-300 px-2 text-xs text-red-700">×</button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {!locked ? (
        adding ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <FieldForm
              formId={formId}
              locale={locale}
              labels={labels}
              defaultOrder={(fields.at(-1)?.sort_order ?? 0) + 10}
              onDone={() => {
                setAdding(false);
                router.refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            + {labels.addField}
          </button>
        )
      ) : null}
    </div>
  );
}

function FieldForm({
  formId,
  locale,
  initial,
  labels,
  defaultOrder,
  onDone,
  onCancel,
}: {
  formId: string;
  locale: string;
  initial?: FieldRow;
  labels: Record<string, string>;
  defaultOrder?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    fieldKey: initial?.field_key ?? '',
    labelVi: initial?.labelVi ?? '',
    dataType: initial?.data_type ?? 'text',
    isRequired: initial?.is_required ?? false,
    section: initial?.section ?? '',
    optionsText: initial?.options ?? '',
    sortOrder: initial?.sort_order ?? defaultOrder ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const input = 'w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm';
  const needsOptions = f.dataType === 'select';

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.fieldKey}</label>
          <input
            className={input + ' font-mono'}
            value={f.fieldKey}
            onChange={(e) => setF({ ...f, fieldKey: e.target.value })}
            placeholder="full_name"
            disabled={Boolean(initial)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-slate-600">{labels.label} (vi)</label>
          <input
            className={input}
            value={f.labelVi}
            onChange={(e) => setF({ ...f, labelVi: e.target.value })}
            placeholder="Họ và tên"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.type}</label>
          <select
            className={input}
            value={f.dataType}
            onChange={(e) => setF({ ...f, dataType: e.target.value })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">{labels.section}</label>
          <input
            className={input}
            value={f.section}
            onChange={(e) => setF({ ...f, section: e.target.value })}
            placeholder="identity"
          />
        </div>
      </div>

      {needsOptions ? (
        <div>
          <label className="mb-1 block text-xs text-slate-600">
            {labels.options} — 한 줄에 하나씩, <code className="font-mono">값=표시문구</code>
          </label>
          <textarea
            className={input + ' font-mono'}
            rows={3}
            value={f.optionsText}
            onChange={(e) => setF({ ...f, optionsText: e.target.value })}
            placeholder={'M=Nam\nF=Nữ'}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={f.isRequired}
            onChange={(e) => setF({ ...f, isRequired: e.target.checked })}
          />
          {labels.required}
        </label>
        <button
          disabled={busy || !f.fieldKey || !f.labelVi}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const res = await saveFieldAction({ formId, locale, ...f });
            setBusy(false);
            if (res.ok) onDone();
            else setErr(res.error ?? 'failed');
          }}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {labels.save}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
        >
          {labels.cancel}
        </button>
        {err ? <span className="text-sm text-red-600">{err}</span> : null}
      </div>
    </div>
  );
}
