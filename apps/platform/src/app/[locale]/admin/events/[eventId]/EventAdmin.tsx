'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MatchFormat } from '@vsp/sport-domain/bracket/types';
import { approveEventAction, generateDrawAction, addEntryAction } from '../actions';

/**
 * 대회 운영 도구 묶음.
 * 개최 승인 → 참가자 추가 → 대진 생성 순으로 쓰게 되어 있다.
 * 아직 구현되지 않은 경기 방식을 고르면 수동 입력으로 안내한다.
 */
export function EventAdmin({
  eventId,
  locale,
  approvalStatus,
  formats,
  labels,
}: {
  eventId: string;
  locale: string;
  approvalStatus: string;
  formats: Array<{ format: MatchFormat; description: string }>;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [decisionNo, setDecisionNo] = useState('');
  const [format, setFormat] = useState<MatchFormat>(formats[0]?.format ?? 'TOURNAMENT');
  const [entryName, setEntryName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';
  const btn =
    'rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      setMsg(okMsg);
      router.refresh();
    } else {
      setError(res.error ?? 'failed');
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end gap-3">
        {approvalStatus !== 'APPROVED' ? (
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-600">{labels.decisionNo}</label>
              <input
                className={input}
                value={decisionNo}
                onChange={(e) => setDecisionNo(e.target.value)}
                placeholder="123/QĐ-CTDTT"
              />
            </div>
            <button
              className={btn}
              disabled={busy}
              onClick={() => run(() => approveEventAction(eventId, decisionNo, locale), 'approved')}
            >
              {labels.approve}
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.name}</label>
            <input
              className={input}
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <button
            className={btn}
            disabled={busy || !entryName}
            onClick={() =>
              run(async () => {
                const r = await addEntryAction({ eventId, personName: entryName, locale });
                if (r.ok) setEntryName('');
                return r;
              }, 'entry added')
            }
          >
            + {labels.addEntry}
          </button>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-600">{labels.format}</label>
            <select
              className={input}
              value={format}
              onChange={(e) => setFormat(e.target.value as MatchFormat)}
            >
              {formats.map((f) => (
                <option key={f.format} value={f.format}>
                  {f.format}
                </option>
              ))}
            </select>
          </div>
          <button
            className={btn}
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await generateDrawAction(eventId, format, locale);
                if (r.ok) setMsg(`${r.created} matches created${r.notes?.length ? ' — ' + r.notes.join(', ') : ''}`);
                return r;
              }, 'draw generated')
            }
          >
            {labels.generateDraw}
          </button>
        </div>
      </div>

      {msg ? (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.startsWith('FORMAT_NOT_IMPLEMENTED')
            ? `${error.split(':')[1]} — not implemented yet, use manual entry`
            : error}
        </p>
      ) : null}
    </div>
  );
}
