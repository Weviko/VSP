import Link from 'next/link';
import { query } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { requireWorkspace } from '@/lib/session';

// 관리자 화면은 실시간 데이터가 필요하다 (빌드 타임 정적 생성 금지)
export const dynamic = 'force-dynamic';

interface Dashboard {
  orgs: number; people: number; pending: number; events: number;
  ingest: number; unpaid: number; due: number;
  recent: Array<{ action: string; entity_table: string; at: string }>;
}

async function load(): Promise<{ data: Dashboard | null; error?: string }> {
  try {
    const rows = await query<Record<string, string>>(`
      SELECT
        (SELECT count(*) FROM core.organization WHERE deleted_at IS NULL) AS orgs,
        (SELECT count(*) FROM core.person WHERE deleted_at IS NULL) AS people,
        (SELECT count(*) FROM core.form_submission WHERE status IN ('SUBMITTED','IN_REVIEW')) AS pending,
        (SELECT count(*) FROM sport.event WHERE starts_on >= CURRENT_DATE AND status <> 'CANCELLED') AS events,
        (SELECT count(*) FROM core.ingestion_job WHERE status = 'EXTRACTED') AS ingest,
        (SELECT count(*) FROM core.payment_order WHERE status = 'PENDING') AS unpaid,
        (
          (SELECT count(*) FROM grant_mgmt.award WHERE status <> 'CLOSED'
            AND settlement_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)
          + (SELECT count(*) FROM core.dispatch WHERE reply_doc_id IS NULL AND reply_due_on IS NOT NULL
              AND reply_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)
          + (SELECT count(*) FROM sport.event WHERE entry_closes_at IS NOT NULL
              AND entry_closes_at BETWEEN now() AND now() + interval '7 days')
        ) AS due
    `);
    const recent = await query<{ action: string; entity_table: string; at: string }>(
      `SELECT action, entity_table, created_at::text AS at
         FROM core.audit_log ORDER BY created_at DESC LIMIT 6`
    );
    const r = rows[0] ?? {};
    const n = (k: string) => Number(r[k] ?? 0);
    return { data: {
      orgs: n('orgs'), people: n('people'), pending: n('pending'), events: n('events'),
      ingest: n('ingest'), unpaid: n('unpaid'), due: n('due'), recent,
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
  const { data, error } = await load();
  const base = `/${locale}/admin`;

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
                { label: t('nav.approvals'), value: data.pending, href: `${base}/approvals`, tone: data.pending > 0 },
                { label: t('nav.ingest'), value: data.ingest, href: `${base}/ingest`, tone: data.ingest > 0 },
                { label: t('dash.unpaid'), value: data.unpaid, href: `${base}/payments`, tone: data.unpaid > 0 },
                { label: t('dash.dueThisWeek'), value: data.due, href: `${base}/grants`, tone: data.due > 0 },
              ].map((c) => (
                <Link key={c.label} href={c.href}
                  className={'rounded-lg border p-4 ' + (c.tone ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                  <p className="text-sm text-slate-600">{c.label}</p>
                  <p className={'mt-1 text-2xl font-bold tabular-nums ' + (c.tone ? 'text-amber-700' : 'text-slate-400')}>{c.value}</p>
                </Link>
              ))}
            </div>
          </section>

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
