'use client';

import { useState, useTransition } from 'react';
import type { OrgValidationResult } from '@vsp/core-admin';
import { FileField, type FileValue } from '@/components/FileField';
import { validateOrgAction, commitOrgAction } from './actions';

/**
 * 조직 엑셀 일괄 등록 패널.
 *   업로드 → 검증(미리보기, 저장 안 함) → 확정 등록.
 * 검증에서 통과한 행만 상위→하위 순서로 등록되고, 오류·중복 행은 표에 이유와 함께 남는다.
 * 사람 명단 패널(ImportPanel)과 같은 흐름이되, 컬럼이 조직용(코드·레벨·상위)이다.
 */
export function OrgImportPanel({
  locale,
  labels,
}: {
  locale: string;
  labels: Record<string, string>;
}) {
  const [file, setFile] = useState<FileValue | null>(null);
  const [result, setResult] = useState<OrgValidationResult | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const L = (k: string) => labels[k] ?? k;

  function validate() {
    if (!file) return;
    setErr(null); setDone(null);
    start(async () => {
      try { setResult(await validateOrgAction(locale, file.id)); }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    });
  }
  function commit() {
    if (!file) return;
    setErr(null);
    start(async () => {
      try { setDone(await commitOrgAction(locale, file.id)); setResult(null); }
      catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">{L('file')}</label>
          <FileField
            value={file}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            labels={{ upload: L('upload'), uploading: L('uploading'), remove: L('remove'), tooLarge: L('tooLarge'), badType: L('badType') }}
            onChange={(v) => { setFile(v); setResult(null); setDone(null); }}
          />
        </div>
        <button onClick={validate} disabled={!file || pending}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
          {pending ? L('working') : L('validate')}
        </button>
      </div>

      {err ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div> : null}

      {done ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          {L('committed')} — {L('inserted')}: <b>{done.inserted}</b> · {L('skipped')}: <b>{done.skipped}</b>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded bg-slate-100 px-2.5 py-1 text-sm">{L('total')}: <b>{result.total}</b></span>
            <span className="rounded bg-emerald-50 px-2.5 py-1 text-sm text-emerald-800">{L('valid')}: <b>{result.valid}</b></span>
            <span className="rounded bg-red-50 px-2.5 py-1 text-sm text-red-700">{L('errors')}: <b>{result.errors}</b></span>
            <button onClick={commit} disabled={result.valid === 0 || pending}
              className="ml-auto rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40">
              {L('commit')} ({result.valid})
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">{L('row')}</th>
                  <th className="px-3 py-2 font-medium">{L('colId')}</th>
                  <th className="px-3 py-2 font-medium">{L('colName')}</th>
                  <th className="px-3 py-2 font-medium">{L('colLevel')}</th>
                  <th className="px-3 py-2 font-medium">{L('colParent')}</th>
                  <th className="px-3 py-2 font-medium">{L('result')}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row} className={'border-b border-slate-100 last:border-0 ' + (r.ok ? '' : 'bg-red-50/40')}>
                    <td className="px-3 py-1.5 tabular-nums text-slate-500">{r.row}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-700">{r.display_id || '—'}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-900 wrap-anywhere">{r.name_vi || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.level_type || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.parent_display_id ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      {r.ok ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">OK</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {r.errors.map((c) => (
                            <span key={c} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{L('e.' + c)}</span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
