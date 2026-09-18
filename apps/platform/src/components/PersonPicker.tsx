'use client';

import { useEffect, useRef, useState } from 'react';
import type { PersonHit } from '@vsp/core-admin';

/**
 * 사람 선택기 (typeahead).
 *
 * UUID 를 손으로 붙여넣는 대신 이름·전화번호로 찾아 고른다 — 오배정을 막는다.
 * 고른 사람의 id 는 숨은 input(name)으로 폼에 실린다. 검색은 상위가 넘겨준 서버 액션으로 한다
 * (화면마다 자기 권한 컨텍스트의 액션을 넘겨 재사용).
 */
export function PersonPicker({
  name = 'person_id',
  onSearch,
  labels,
  required,
}: {
  name?: string;
  onSearch: (q: string) => Promise<PersonHit[]>;
  labels: { search: string; noResults: string; minChars: string; change: string };
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<PersonHit | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 바깥을 누르면 목록을 닫는다
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

  function label(p: PersonHit): string {
    const bits = [p.birth_year ? String(p.birth_year) : null, p.phone].filter(Boolean);
    return bits.length ? `${p.full_name} · ${bits.join(' · ')}` : p.full_name;
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={selected.id} />
        <span className="flex-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-sm text-emerald-900">
          {label(selected)}
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
      {/* 선택 전에는 값이 없으므로, required 폼이면 제출을 막기 위한 빈 hidden input */}
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
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { setSelected(p); setOpen(false); }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sky-50"
                  >
                    <span className="font-medium text-slate-900 wrap-anywhere">{p.full_name}</span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">
                      {[p.birth_year ?? null, p.phone].filter(Boolean).join(' · ')}
                    </span>
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
