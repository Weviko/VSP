import Link from 'next/link';
import { query, t as pick, type I18nText } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { requireWorkspace } from '@/lib/session';

// 관리자 화면은 실시간 데이터가 필요하다 (빌드 타임 정적 생성 금지)
export const dynamic = 'force-dynamic';

interface LevelRow { code: string; name: string; n: number }
interface WeekRow { label: string; n: number }
interface Dashboard {
  orgs: number; people: number; pending: number; events: number;
  ingest: number; unpaid: number; due: number; oldestPending: number;
  byLevel: LevelRow[]; weekly: WeekRow[];
  recent: Array<{ action: string; entity_table: string; at: string }>;
}

async function load(locale: Locale): Promise<{ data: Dashboard | null; error?: string }> {
  try {
    const rows = await query<Record<string, string>>(`
      SELECT
        (SELECT count(*) FROM core.organization WHERE deleted_at IS NULL) AS orgs,
        (SELECT count(*) FROM core.person WHERE deleted_at IS NULL) AS people,
        (SELECT count(*) FROM core.form_submission WHERE status IN ('SUBMITTED','IN_REVIEW')) AS pending,
        (SELECT count(*) FROM sport.event WHERE starts_on >= CURRENT_DATE AND status <> 'CANCELLED') AS events,
        (SELECT count(*) FROM core.ingestion_job WHERE status = 'EXTRACTED') AS ingest,
        (SELECT count(*) FROM core.payment_order WHERE status = 'PENDING') AS unpaid,
        (SELECT coalesce(max(EXTRACT(day FROM now() - coalesce(submitted_at, created_at)))::int, 0)
           FROM core.form_submission WHERE status IN ('SUBMITTED','IN_REVIEW')) AS oldest_pending,
        (
          (SELECT count(*) FROM grant_mgmt.award WHERE status <> 'CLOSED'
            AND settlement_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)
          + (SELECT count(*) FROM core.dispatch WHERE reply_doc_id IS NULL AND reply_due_on IS NOT NULL
              AND reply_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)
          + (SELECT count(*) FROM sport.event WHERE entry_closes_at IS NOT NULL
              AND entry_closes_at BETWEEN now() AND now() + interval '7 days')
        ) AS due
    `);
    // 조직 단계별 분포 (커버리지) — 조직이 하나라도 있는 단계만, 정의된 순서대로.
    const levelRows = await query<{ code: string; name_i18n: I18nText; n: string }>(
      `SELECT lt.code, lt.name_i18n, count(o.id)::text AS n
         FROM core.org_level_type lt
         JOIN core.organization o ON o.level_type = lt.code AND o.deleted_at IS NULL
        GROUP BY lt.code, lt.name_i18n, lt.sort_order
        ORDER BY lt.sort_order`
    );
    // 최근 8주 신규 인물 등록 추이 — 빈 주도 0으로 채워 연속 그래프가 되게 한다.
    const weekRows = await query<{ label: string; n: string }>(
      `SELECT to_char(g.wk, 'MM/DD') AS label, coalesce(c.n, 0)::text AS n
         FROM generate_series(date_trunc('week', CURRENT_DATE) - interval '7 weeks',
                              date_trunc('week', CURRENT_DATE), interval '1 week') AS g(wk)
         LEFT JOIN (SELECT date_trunc('week', created_at) AS wk, count(*) AS n
                      FROM core.person WHERE deleted_at IS NULL GROUP BY 1) c ON c.wk = g.wk
        ORDER BY g.wk`
    );
    const recent = await query<{ action: string; entity_table: string; at: string }>(
      `SELECT action, entity_table, created_at::text AS at
         FROM core.audit_log ORDER BY created_at DESC LIMIT 6`
    );
    const r = rows[0] ?? {};
    const n = (k: string) => Number(r[k] ?? 0);
    return { data: {
      orgs: n('orgs'), people: n('people'), pending: n('pending'), events: n('events'),
      ingest: n('ingest'), unpaid: n('unpaid'), due: n('due'), oldestPending: n('oldest_pending'),
      byLevel: levelRows.map((l) => ({ code: l.code, name: pick(l.name_i18n, locale), n: Number(l.n) })),
      weekly: weekRows.map((w) => ({ label: w.label, n: Number(w.n) })),
      recent,
    } };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { data, error } = await load(locale);
  const base = `/${locale}/admin`;

  const maxLevel = data ? Math.max(1, ...data.byLevel.map((l) => l.n)) : 1;
  const maxWeek = data ? Math.max(1, ...data.weekly.map((w) => w.n)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('nav.dashboard')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('app.tagline')}</p>
      </div>

      {!data ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : (
        <>
          {/* 현황 */}
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: t('nav.organizations'), value: data.orgs, href: `${base}/organizations` },
              { label: t('nav.people'), value: data.people, href: `${base}/people` },
              { label: t('nav.registrations'), value: data.pending, href: `${base}/approvals` },
              { label: t('nav.events'), value: data.events, href: `${base}/events` },
            ].map((c) => (
              <Link key={c.label} href={c.href} className="rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300 hover:bg-slate-50">
                <dt className="text-sm text-slate-600">{c.label}</dt>
                <dd className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{c.value.toLocaleString()}</dd>
              </Link>
            ))}
          </dl>

          {/* 처리할 일 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">{t('dash.todo')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: t('nav.approvals'), value: data.pending, href: `${base}/approvals`, tone: data.pending > 0,
                  sub: data.pending > 0 && data.oldestPending > 0 ? t('dash.oldestPending', { n: data.oldestPending }) : undefined },
                { label: t('nav.ingest'), value: data.ingest, href: `${base}/ingest`, tone: data.ingest > 0, sub: undefined },
                { label: t('dash.unpaid'), value: data.unpaid, href: `${base}/payments`, tone: data.unpaid > 0, sub: undefined },
                { label: t('dash.dueThisWeek'), value: data.due, href: `${base}/grants`, tone: data.due > 0, sub: undefined },
              ].map((c) => (
                <Link key={c.label} href={c.href}
                  className={'rounded-lg border p-4 ' + (c.tone ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                  <p className="text-sm text-slate-600">{c.label}</p>
                  <p className={'mt-1 text-2xl font-bold tabular-nums ' + (c.tone ? 'text-amber-700' : 'text-slate-400')}>{c.value}</p>
                  {c.sub ? <p className="mt-0.5 text-xs font-medium text-amber-700">{c.sub}</p> : null}
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 조직 커버리지 (단계별) */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">{t('dash.coverage')}</h2>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                {data.byLevel.length === 0 ? (
                  <p className="text-sm text-slate-400">{t('common.noData')}</p>
                ) : data.byLevel.map((l) => (
                  <div key={l.code} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-sm text-slate-600" title={l.name}>{l.name}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="h-full rounded bg-[#15607A]" style={{ width: `${Math.max(4, (l.n / maxLevel) * 100)}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">{l.n.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 최근 8주 신규 등록 추이 */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">{t('dash.trend')}</h2>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex h-40 items-end justify-between gap-1.5">
                  {data.weekly.map((w, i) => (
                    <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs font-medium tabular-nums text-slate-500">{w.n}</span>
                      <div
                        className="w-full rounded-t bg-[#1c7fa0]"
                        style={{ height: `${Math.max(2, (w.n / maxWeek) * 100)}%` }}
                        title={`${w.label}: ${w.n}`}
                      />
                      <span className="text-[10px] tabular-nums text-slate-400">{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* 최근 활동 */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">{t('dash.recent')}</h2>
            {data.recent.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{t('dash.noRecent')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {data.recent.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      <span className="font-mono text-xs text-slate-400">{a.entity_table}</span>
                      <span className="ml-2 font-medium text-slate-800">{a.action}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-400">{a.at.slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
