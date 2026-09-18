import { listAuditLog, auditFacets, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 감사 로그 뷰어 — 읽기 전용.
 * "누가·언제·무엇을" 바꿨는지 엔티티·액션·기간으로 좁혀 보고, 변경 전/후를 펼쳐 확인한다.
 * 정부 감사·분쟁 증거이므로 이 화면에서도 수정·삭제 경로는 두지 않는다(조회만).
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ table?: string; action?: string; from?: string; to?: string; entity?: string }>;
}) {
  const { locale: raw } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let rows = null;
  let facets = { tables: [] as string[], actions: [] as string[] };
  let error: string | undefined;
  try {
    [rows, facets] = await Promise.all([
      listAuditLog({
        entityTable: sp.table || null,
        action: sp.action || null,
        entityId: (sp.entity as UUID) || null,
        from: sp.from || null,
        to: sp.to || null,
        limit: 200,
      }),
      auditFacets(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const sel = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />

      {/* 필터 */}
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('audit.entity')}</span>
            <select name="table" defaultValue={sp.table ?? ''} className={sel}>
              <option value="">{t('audit.all')}</option>
              {facets.tables.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('audit.action')}</span>
            <select name="action" defaultValue={sp.action ?? ''} className={sel}>
              <option value="">{t('audit.all')}</option>
              {facets.actions.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('audit.from')}</span>
            <input type="date" name="from" defaultValue={sp.from ?? ''} className={sel} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('audit.to')}</span>
            <input type="date" name="to" defaultValue={sp.to ?? ''} className={sel} />
          </label>
          {sp.entity ? <input type="hidden" name="entity" value={sp.entity} /> : null}
          <button className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('audit.apply')}</button>
        </form>
      </Card>

      {!rows ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : rows.length === 0 ? (
        <EmptyState message={t('audit.empty')} />
      ) : (
        <Table head={[t('audit.when'), t('audit.actor'), t('audit.entity'), t('audit.action'), t('audit.changes')]}>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="whitespace-nowrap tabular-nums text-slate-500">{r.occurred_at.slice(0, 19).replace('T', ' ')}</Td>
              <Td className="text-slate-700 wrap-anywhere">
                {r.actor_name ?? (r.actor_ip ? `IP ${r.actor_ip}` : t('audit.system'))}
              </Td>
              <Td className="text-slate-600">
                <span className="font-mono text-xs">{r.entity_table}</span>
                {r.entity_id ? <span className="ml-1 text-slate-400">{r.entity_id.slice(0, 8)}</span> : null}
              </Td>
              <Td><Badge>{r.action}</Badge></Td>
              <Td>
                {r.before_data || r.after_data ? (
                  <details>
                    <summary className="cursor-pointer text-sm text-sky-700 hover:underline">{t('audit.changes')}</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-500">{t('audit.before')}</p>
                        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{r.before_data ? JSON.stringify(r.before_data, null, 2) : '—'}</pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-500">{t('audit.after')}</p>
                        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{r.after_data ? JSON.stringify(r.after_data, null, 2) : '—'}</pre>
                      </div>
                    </div>
                    {r.note ? <p className="mt-2 text-xs text-slate-500">{t('audit.note')}: {r.note}</p> : null}
                  </details>
                ) : (
                  <span className="text-xs text-slate-400">{r.note ?? '—'}</span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
