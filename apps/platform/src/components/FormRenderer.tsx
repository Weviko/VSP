'use client';

import { useMemo, useState, type ReactNode } from 'react';
// 주의: 클라이언트 번들이므로 DB에 의존하지 않는 순수 모듈만 import 한다
import type { FormWithFields, FormField, ValidationError } from '@vsp/core-admin/form-schema';
import { isFieldVisible } from '@vsp/core-admin/form-schema';
import { t as pickI18n } from '@vsp/core-admin/i18n';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { FileField, type FileValue } from './FileField';

/**
 * 동적 폼 렌더러.
 *
 * DB에 저장된 필드 정의를 읽어 화면을 만든다.
 * 체육회 공식 서식이 나중에 어떤 모양으로 오더라도 이 컴포넌트는 바뀌지 않는다.
 * 바뀌는 것은 DB의 form_field 행뿐이다.
 */
export interface FormLabels {
  submit: string;
  required: string;
  cancel?: string;
  /** 첨부 입력에 쓰는 문구. 없으면 영어 기본값으로 대체한다. */
  upload?: string;
  uploading?: string;
  remove?: string;
  fileTooLarge?: string;
  fileBadType?: string;
}

export function FormRenderer({
  form,
  locale,
  labels,
  onSubmit,
  orgOptions = [],
  disciplineOptions = [],
  initialData,
  annotate,
}: {
  form: FormWithFields;
  locale: Locale;
  labels: FormLabels;
  onSubmit: (data: Record<string, unknown>) => Promise<{ errors?: ValidationError[] } | void>;
  orgOptions?: Array<{ id: string; label: string }>;
  disciplineOptions?: Array<{ id: string; label: string }>;
  /** 초기값 (예: AI 가 추출한 초안). default_value 위에 덮어쓴다. */
  initialData?: Record<string, unknown>;
  /** 항목 라벨 옆에 붙일 표식 (예: 추출 신뢰도 배지). */
  annotate?: (fieldKey: string) => ReactNode;
}) {
  const [data, setData] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of form.fields) if (f.default_value !== null) init[f.field_key] = f.default_value;
    if (initialData) for (const [k, v] of Object.entries(initialData)) if (v !== undefined) init[k] = v;
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // 섹션별로 묶어 표시 (신분/연락처/소속/종목/신체/서류)
  const sections = useMemo(() => {
    const map = new Map<string, FormField[]>();
    for (const f of form.fields) {
      const key = f.section ?? '_';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return [...map.entries()];
  }, [form.fields]);

  function set(key: string, value: unknown) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await onSubmit(data);
      if (res && 'errors' in res && res.errors?.length) {
        setErrors(Object.fromEntries(res.errors.map((x) => [x.field, x.code])));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {sections.map(([section, fields]) => (
        <fieldset key={section} className="rounded-lg border border-slate-200 bg-white p-5">
          {section !== '_' ? (
            <legend className="px-2 text-sm font-semibold text-slate-500 uppercase tracking-wide">
              {section}
            </legend>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields
              .filter((f) => isFieldVisible(f, data))
              .map((f) => (
                <Field
                  key={f.id}
                  field={f}
                  locale={locale}
                  value={data[f.field_key]}
                  error={errors[f.field_key]}
                  requiredLabel={labels.required}
                  labels={labels}
                  onChange={(v) => set(f.field_key, v)}
                  orgOptions={orgOptions}
                  disciplineOptions={disciplineOptions}
                  annotation={annotate ? annotate(f.field_key) : null}
                />
              ))}
          </div>
        </fieldset>
      ))}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {labels.submit}
        </button>
      </div>
    </form>
  );
}

function Field({
  field,
  locale,
  value,
  error,
  requiredLabel,
  labels,
  onChange,
  orgOptions,
  disciplineOptions,
  annotation,
}: {
  field: FormField;
  locale: Locale;
  value: unknown;
  error?: string;
  requiredLabel: string;
  labels: FormLabels;
  onChange: (v: unknown) => void;
  orgOptions: Array<{ id: string; label: string }>;
  disciplineOptions: Array<{ id: string; label: string }>;
  annotation?: ReactNode;
}) {
  const label = pickI18n(field.label_i18n, locale);
  const help = field.help_i18n ? pickI18n(field.help_i18n, locale) : null;
  const wide = field.data_type === 'textarea' || field.data_type === 'table';
  const base =
    'w-full rounded border px-3 py-2 text-sm ' +
    (error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white');

  // select 계열 선택지: 필드에 정의된 것 또는 상위에서 주입된 참조 목록
  const choices: Array<{ value: string; label: string }> =
    field.data_type === 'org'
      ? orgOptions.map((o) => ({ value: o.id, label: o.label }))
      : field.field_key === 'discipline'
        ? disciplineOptions.map((o) => ({ value: o.id, label: o.label }))
        : (field.options ?? []).map((o) => ({ value: o.value, label: pickI18n(o.label_i18n, locale) }));

  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
        <span>
          {label}
          {field.is_required ? <span className="ml-1 text-red-500">*</span> : null}
        </span>
        {annotation}
      </label>

      {field.data_type === 'textarea' ? (
        <textarea
          className={base}
          rows={4}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.data_type === 'select' || field.data_type === 'org' ? (
        <select className={base} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      ) : field.data_type === 'checkbox' ? (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : field.data_type === 'file' ? (
        <FileField
          value={(value as FileValue | null) ?? null}
          accept={field.validation?.accept?.join(',')}
          invalid={Boolean(error)}
          labels={{
            upload: labels.upload ?? 'Upload',
            uploading: labels.uploading ?? 'Uploading...',
            remove: labels.remove ?? 'Remove',
            tooLarge: labels.fileTooLarge ?? 'File is too large',
            badType: labels.fileBadType ?? 'File type is not allowed',
          }}
          onChange={onChange}
        />
      ) : (
        <input
          type={field.data_type === 'number' ? 'number' : field.data_type === 'date' ? 'date' : 'text'}
          className={base}
          value={String(value ?? '')}
          min={field.validation?.min}
          max={field.validation?.max}
          onChange={(e) =>
            onChange(field.data_type === 'number' ? Number(e.target.value) : e.target.value)
          }
        />
      )}

      {help ? <p className="mt-1 text-xs text-slate-500">{help}</p> : null}
      {error ? (
        <p className="mt-1 text-xs text-red-600">
          {error === 'REQUIRED' ? requiredLabel : error}
        </p>
      ) : null}
    </div>
  );
}
