'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadDraftAction } from '@/app/[locale]/admin/upload-actions';

/**
 * 첨부 입력.
 *
 * 고른 즉시 서버로 올리고, 폼에는 파일 이름이 아니라 첨부 id 를 담는다.
 * 파일 이름만 담으면 화면상으로는 서류를 낸 것처럼 보이는데 실제로는 아무것도 저장되지 않아,
 * 결재가 있지도 않은 증빙을 근거로 통과한다. 등록 서류에서는 이게 가장 위험한 종류의 빈 칸이다.
 *
 * 올린 파일은 DRAFT 상태로 두고, 제출이 성공하는 순간 그 신청서 소유로 옮긴다.
 * 제출하지 않고 창을 닫으면 DRAFT 로 남는다 — 다른 신청서에 붙지 않는다.
 */
export interface FileValue {
  id: string;
  name: string;
  size?: number;
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileField({
  value,
  accept,
  labels,
  invalid,
  onChange,
}: {
  value: FileValue | null;
  accept?: string;
  invalid?: boolean;
  labels: {
    upload: string;
    uploading: string;
    remove: string;
    tooLarge: string;
    badType: string;
  };
  onChange: (v: FileValue | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
    start(async () => {
      const res = await uploadDraftAction(fd);
      if (res.ok && res.id && res.name) {
        onChange({ id: res.id, name: res.name, size: res.size });
      } else {
        // 올라가지 않았으면 값을 비워 둔다. 실패한 첨부가 값으로 남으면 안 된다.
        onChange(null);
        setError(
          res.error === 'TOO_LARGE' ? labels.tooLarge
          : res.error === 'BAD_TYPE' ? labels.badType
          : (res.error ?? 'ERROR')
        );
      }
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-slate-300 bg-white px-3 py-2 text-sm">
        <a
          href={`/api/files/${value.id}`}
          className="truncate text-slate-800 underline decoration-slate-300 hover:decoration-slate-600"
        >
          {value.name}
        </a>
        <span className="flex shrink-0 items-center gap-2">
          {value.size ? (
            <span className="text-xs tabular-nums text-slate-500">{humanSize(value.size)}</span>
          ) : null}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            {labels.remove}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        disabled={pending}
        accept={accept}
        aria-invalid={invalid || Boolean(error)}
        className={
          'w-full rounded border px-3 py-2 text-sm disabled:opacity-50 ' +
          (invalid || error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white')
        }
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {pending ? <p className="mt-1 text-xs text-slate-500">{labels.uploading}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
