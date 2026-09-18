import {
  listPaymentOrders, listFeeRules, getPaymentSummary, getOrgTree,
  formatVND, t as pick,
} from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import {
  PageHeader, StatCard, Badge, statusTone, Table, Tr, Td, EmptyState, ExportButton,
} from '@vsp/web-shared/ui';
import { PaymentTools, CashButton } from './PaymentTools';
import { deleteFeeRuleForm } from './actions';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

function flattenOrgs(
  nodes: Awaited<ReturnType<typeof getOrgTree>>,
  locale: Locale,
  depth = 0
): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'- '.repeat(depth)}${pick(n.name_i18n, locale)}` },
    ...flattenOrgs(n.children, locale, depth + 1),
  ]);
}

/** 자금 흐름을 화면에서도 명시한다. 협회가 "돈이 어디로 가느냐"를 가장 먼저 묻기 때문이다. */
function fundsNotice(locale: Locale): string {
  if (locale === 'ko')
    return '자금 흐름: 납부자 → PG(VNPAY 등) → 협회 계좌로 직접 입금됩니다. 플랫폼 계좌를 거치지 않습니다.';
  if (locale === 'en')
    return 'Funds flow: payer → payment gateway → federation account directly. Never through the platform account.';
  return 'Dòng tiền: người nộp → cổng thanh toán → thẳng vào tài khoản liên đoàn. Không qua tài khoản nền tảng.';
}

export default async function PaymentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let data = null;
  let error: string | undefined;
  try {
    const [orders, rules, summary, tree] = await Promise.all([
      listPaymentOrders({ limit: 100 }),
      listFeeRules(),
      getPaymentSummary(),
      getOrgTree(),
    ]);
    data = { orders, rules, summary, orgs: flattenOrgs(tree, locale) };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('pay.title')} />
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pay.title')}
        right={<ExportButton kind="payments" label={t('common.export')} params={{ locale }} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('pay.paid')} value={data.summary.paid_count} />
        <StatCard
          label={`${t('pay.paid')} · ${t('common.total')}`}
          value={formatVND(data.summary.paid_amount)}
        />
        <StatCard label={t('pay.unpaid')} value={data.summary.pending_count} />
        <StatCard
          label={`${t('pay.unpaid')} · ${t('common.total')}`}
          value={formatVND(data.summary.pending_amount)}
        />
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        {fundsNotice(locale)}
      </div>

      <PaymentTools
        locale={locale}
        orgs={data.orgs}
        labels={{
          createRule: t('pay.createRule'),
          order: t('pay.order'),
          amount: t('pay.amount'),
          name: t('org.name'),
          save: t('common.save'),
          payee: t('pay.payee'),
        }}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('pay.rule')} ({data.rules.length})
        </h2>
        {data.rules.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={['Code', t('org.name'), t('pay.amount'), '']}>
            {data.rules.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs text-slate-500">{r.code}</Td>
                <Td className="font-medium text-slate-900">{pick(r.name_i18n, locale)}</Td>
                <Td className="tabular-nums">{formatVND(r.amount)}</Td>
                <Td>
                  <form action={deleteFeeRuleForm.bind(null, locale)}>
                    <input type="hidden" name="rule_id" value={r.id} />
                    <button className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600" title={t('common.delete')}>×</button>
                  </form>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('pay.order')} ({data.orders.length})
        </h2>
        {data.orders.length === 0 ? (
          <EmptyState message={t('pay.empty')} />
        ) : (
          <Table
            head={[
              t('pay.order'), t('pay.payer'), t('pay.payee'),
              t('pay.amount'), t('pay.method'), t('common.status'), '',
            ]}
          >
            {data.orders.map((o) => (
              <Tr key={o.id}>
                <Td className="font-mono text-xs text-slate-500">{o.order_no}</Td>
                <Td className="text-slate-700">{o.payer_name ?? '-'}</Td>
                <Td className="text-slate-600 wrap-anywhere">{pick(o.payee_name, locale)}</Td>
                <Td className="tabular-nums font-medium">{formatVND(o.amount)}</Td>
                <Td className="text-slate-600">
                  {o.method ?? '-'}
                  {o.is_offline ? <span className="ml-1 text-xs text-slate-400">cash</span> : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                </Td>
                <Td>
                  {o.status === 'PENDING' ? (
                    <CashButton orderId={o.id} locale={locale} label={t('pay.offline')} />
                  ) : null}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
