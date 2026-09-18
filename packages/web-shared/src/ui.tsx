/**
 * 최소 UI 부품.
 *
 * 지금 단계의 목표는 "구조를 보여주는 것"이다.
 * 디자인은 문체부 협의가 끝난 뒤 IT팀이 입히므로, 여기서는 의미 구분만 명확히 하고
 * 스타일은 최소로 유지한다. 부품을 바꾸면 전체 화면이 한 번에 바뀌도록 모아둔다.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>{children}</div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-slate-500">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-sky-50 text-sky-800',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** 업무 상태를 일관된 색으로 표시한다 (승인=초록, 대기=주황, 반려=빨강) */
export function statusTone(status: string): keyof typeof BADGE_TONES {
  if (['APPROVED', 'ACTIVE', 'CONFIRMED', 'PUBLISHED', 'FINISHED', 'PAID', 'ACCEPTED'].includes(status))
    return 'green';
  if (['REJECTED', 'SUSPENDED', 'CANCELLED', 'FAILED', 'EXPIRED', 'DECLINED', 'WITHDRAWN'].includes(status)) return 'red';
  if (['SUBMITTED', 'IN_REVIEW', 'PENDING', 'PLANNED', 'REVIEW', 'SENT'].includes(status)) return 'amber';
  if (['ONGOING', 'LIVE', 'OPEN', 'VIEWED'].includes(status)) return 'blue';
  return 'neutral';
}

export function Table({
  head,
  children,
}: {
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-slate-100 last:border-0">{children}</tr>;
}

export function Td({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2 ${className}`}>{children}</td>;
}

/**
 * 엑셀 내보내기 단추.
 *
 * 감사 제출과 정부 보고는 결국 엑셀로 오간다. 화면에서 본 것과 같은 자료를
 * 같은 조건으로 받아야 담당자가 대조할 수 있으므로, 화면의 필터를 그대로 넘긴다.
 * 서버가 첨부 헤더를 붙이므로 평범한 링크로 충분하다 — 자바스크립트가 필요 없다.
 */
export function ExportButton({
  kind,
  label,
  params = {},
}: {
  kind: string;
  label: string;
  params?: Record<string, string | number | null | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
  }
  const href = `/api/export/${kind}${qs.size > 0 ? `?${qs.toString()}` : ''}`;
  return (
    <a
      href={href}
      className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
    >
      {label}
    </a>
  );
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const cls =
    variant === 'primary'
      ? 'rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700'
      : 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100';
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
