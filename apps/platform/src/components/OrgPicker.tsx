'use client';

import { useEffect, useRef, useState } from 'react';

export interface OrgPickerHit { id: string; label: string; sub?: string }

/**
 * 조직 선택기 (typeahead).
 *
 * 1,500+ 조직을 셀렉트로 늘어놓지 않고 이름·코드·지역으로 찾아 고른다.
 * 고른 조직 id 는 숨은 input(name)으로 폼에 실린다. 검색은 상위가 넘겨준 서버 액션(사전 로컬라이즈)으로 한다.
 */
export function OrgPicker({
  name,
  onSearch,
  labels,
  required,
}: {
  name: string;
  onSearch: (q: string) => Promise<OrgPickerHit[]>;
  labels: { search: string; noResults: string; minChars: string; change: string };
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<OrgPickerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<OrgPickerHit | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function change(v: string) {
    setQ(v);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try { setHits(await onSearch(v)); }
      catch { setHits([]); }
      finally { setBusy(false); }
    }, 250);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={selected.id} />
        <span className="flex-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-900 wrap-anywhere">
          {selected.label}{selected.sub ? <span className="ml-1 text-emerald-700/70">· {selected.sub}</span> : null}
        </span>
        <button
          type="button"
          onClick={() => { setSelected(null); setQ(''); setHits([]); }}
          className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
        >
          {labels.change}
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      {required ? <input type="hidden" name={name} value="" /> : null}
      <input
        value={q}
        onChange={(e) => change(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        placeholder={labels.search}
        autoComplete="off"
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {q.trim().length < 2 ? (
            <p className="px-3 py-2 text-sm text-slate-400">{labels.minChars}</p>
          ) : busy ? (
            <p className="px-3 py-2 text-sm text-slate-400">…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">{labels.noResults}</p>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => { setSelected(h); setOpen(false); }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    <span className="font-medium text-slate-900 wrap-anywhere">{h.label}</span>
                    {h.sub ? <span className="shrink-0 font-mono text-xs text-slate-400">{h.sub}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
