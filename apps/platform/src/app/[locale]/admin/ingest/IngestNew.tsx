'use client';

import { useState } from 'react';
import { FileField, type FileValue } from '@/components/FileField';
import { startIngestAction } from './actions';

/**
 * 새 서류 등록 패널.
 *
 * 서류를 올리면(첨부 id 확보) 어떤 공식 폼으로 등록할지 고르고 "AI 추출 시작"을 누른다.
 * 추출은 서버에서 하고, 끝나면 검토 화면으로 이동한다(자동 제출 아님).
 */
export function IngestNew({
  locale,
  forms,
  labels,
}: {
  locale: string;
  forms: Array<{ code: string; title: string }>;
  labels: {
    pickForm: string;
    start: string;
    hint: string;
    upload: string;
    uploading: string;
    remove: string;
    tooLarge: string;
    badType: string;
  };
}) {
  const [file, setFile] = useState<FileValue | null>(null);

  return (
    <form
      action={startIngestAction.bind(null, locale)}
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.upload}</label>
          <FileField
            value={file}
            labels={{
              upload: labels.upload,
              uploading: labels.uploading,
              remove: labels.remove,
              tooLarge: labels.tooLarge,
              badType: labels.badType,
            }}
            onChange={setFile}
          />
          <input type="hidden" name="attachment_id" value={file?.id ?? ''} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{labels.pickForm}</label>
          <select
            name="form_code"
            defaultValue=""
            required
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>—</option>
            {forms.map((f) => (
              <option key={f.code} value={f.code}>{f.title} ({f.code})</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!file}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {labels.start}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{labels.hint}</p>
    </form>
  );
}
