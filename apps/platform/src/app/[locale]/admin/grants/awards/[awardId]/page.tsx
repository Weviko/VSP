import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAwardDetail, FUND_SOURCE_LABELS, formatVND, t as pick } from '@vsp/core-admin';
import type { FundSource } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { AwardTools } from './AwardTools';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 교부건 상세 — 보조금 업무의 중심 화면.
 *
 * 집행·재교부·정산·검사가 모두 여기서 일어난다.
 * 탭이 아니라 세로 섹션으로 둔 이유: 협회 담당자가 모바일로 보는 경우가 많고,
 * 탭은 "무엇이 있는지" 자체가 보이지 않는다.
 */
export default async function AwardDetailPage({
  params,
}: {
  params: Promise<{ locale: string; awardId: string }>;
}) {
  const { locale: raw, awardId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const detail = await getAwardDetail(awardId).catch(() => null);
  if (!detail) notFound();

  const { award, executions, byFund, children, settlement, inspections } = detail;
  const remaining = Number(award.remaining);
  const pct = Math.min(100, Math.max(0, award.execution_rate));

  return (
    <div className="space-y-8">
      <div>
        <nav className="mb-2 text-sm text-slate-500">
          <Link href={`/${locale}/admin/grants`} className="hover:underline">
            {t('grant.title')}
          </Link>
          <span className="mx-1">/</span>
        </nav>
        <PageHeader
          title={pick(award.program_name, locale)}
          subtitle={pick(award.org_name, locale)}
          right={
            <>
              {award.overdue ? <Badge tone="red">{t('grant.overdue')}</Badge> : null}
              <Badge tone={statusTone(award.status)}>{award.status}</Badge>
            </>
          }
        />
      </div>

      {/* 교부 정보 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">{t('grant.decisionNo')}</p>
          <p className="mt-1 font-mono text-sm">{award.decision_no ?? '-'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('grant.account')}</p>
          <p className="mt-1 font-mono text-sm">{award.dedicated_account ?? '-'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('event.period')}</p>
          <p className="mt-1 text-sm tabular-nums">
            {award.starts_on ?? '-'} ~ {award.ends_on ?? '-'}
          </p>
        </Card>
        <Card className={award.overdue ? 'border-red-300 bg-red-50' : undefined}>
          <p className="text-xs text-slate-500">{t('grant.dueOn')}</p>
          <p
            className={
              'mt-1 text-sm tabular-nums ' + (award.overdue ? 'font-semibold text-red-700' : '')
            }
          >
            {award.settlement_due_on ?? '-'}
          </p>
        </Card>
      </div>

      {/* 집행 현황 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('grant.executed')}</h2>
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {formatVND(award.executed_amount)}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                / {formatVND(award.awarded_amount)}
              </p>
            </div>
            <p className="text-3xl font-bold tabular-nums text-slate-700">{pct}%</p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded bg-slate-100">
            <div
              className={'h-full rounded ' + (pct >= 90 ? 'bg-emerald-600' : 'bg-slate-700')}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* 초과 집행은 서버가 막고 있지만, 에러로 알려주면 이미 늦다. 미리 보여준다. */}
          <p
            className={
              'mt-3 rounded px-3 py-2 text-sm ' +
              (remaining <= 0
                ? 'bg-amber-50 text-amber-900'
                : 'bg-sky-50 text-sky-900')
            }
          >
            {t('grant.remainHint', { n: formatVND(award.remaining) })}
            {Number(award.self_funding) > 0 ? (
              <span className="ml-3 text-slate-600">
                {pick(FUND_SOURCE_LABELS.SELF, locale)} {formatVND(award.self_remaining)}
              </span>
            ) : null}
          </p>

          {byFund.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {byFund.map((f) => (
                <li
                  key={f.fund_source}
                  className="rounded border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <span className="text-slate-600">
                    {pick(FUND_SOURCE_LABELS[f.fund_source as FundSource] ?? { vi: f.fund_source }, locale)}
                  </span>
                  <span className="ml-2 font-medium tabular-nums">{formatVND(f.executed)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </section>

      {/* 도구 — 집행 기록 · 재교부 · 정산 · 검사 */}
      <AwardTools
        locale={locale}
        awardId={award.id}
        status={award.status}
        hasSettlement={Boolean(settlement)}
        remaining={remaining}
        labels={{
          addExecution: t('grant.addExecution'),
          submitSettlement: t('grant.submitSettlement'),
          inspect: t('grant.inspect'),
          amount: t('pay.amount'),
          fundSource: t('grant.fundSource'),
          payee: t('grant.payee'),
          evidence: t('grant.evidence'),
          date: t('common.createdAt'),
          returned: t('grant.returned'),
          carriedOver: t('grant.carriedOver'),
          findings: t('grant.findings'),
          recovery: t('grant.recovery'),
          save: t('common.save'),
          cancel: t('common.cancel'),
        }}
        fundSources={(Object.keys(FUND_SOURCE_LABELS) as FundSource[]).map((k) => ({
          value: k,
          label: pick(FUND_SOURCE_LABELS[k], locale),
        }))}
      />

      {/* 집행 내역 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('grant.executions')} ({executions.length})
        </h2>
        {executions.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={[
              t('common.createdAt'), t('pay.amount'), t('grant.fundSource'),
              t('grant.payee'), t('grant.evidence'),
            ]}
          >
            {executions.map((e) => (
              <Tr key={e.id}>
                <Td className="tabular-nums text-slate-600">{e.executed_on}</Td>
                <Td className="tabular-nums font-medium">{formatVND(e.amount)}</Td>
                <Td className="text-slate-600">
                  {pick(FUND_SOURCE_LABELS[e.fund_source] ?? { vi: e.fund_source }, locale)}
                </Td>
                <Td className="text-slate-600 wrap-anywhere">{e.payee ?? '-'}</Td>
                <Td className="font-mono text-xs text-slate-500">{e.evidence_no ?? '-'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 재교부 */}
      {children.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {t('grant.subAward')} ({children.length})
          </h2>
          <Table head={[t('org.name'), t('grant.awarded'), t('grant.executed'), t('common.status')]}>
            {children.map((c) => (
              <Tr key={c.id}>
                <Td className="wrap-anywhere">
                  <span className="mr-1 text-slate-300">└</span>
                  <Link
                    href={`/${locale}/admin/grants/awards/${c.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {pick(c.org_name, locale)}
                  </Link>
                </Td>
                <Td className="tabular-nums">{formatVND(c.awarded_amount)}</Td>
                <Td className="tabular-nums text-slate-600">{formatVND(c.executed)}</Td>
                <Td>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        </section>
      ) : null}

      {/* 정산 */}
      {settlement ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('grant.settlement')}</h2>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone={statusTone(settlement.status)}>{settlement.status}</Badge>
              <span className="text-xs text-slate-500 tabular-nums">
                {settlement.submitted_at ? settlement.submitted_at.slice(0, 10) : '-'}
              </span>
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-4">
              {[
                { k: t('grant.executed'), v: settlement.executed_amount },
                { k: t('grant.remaining'), v: settlement.remaining_amount },
                { k: t('grant.returned'), v: settlement.returned_amount },
                { k: t('grant.carriedOver'), v: settlement.carried_over_amount },
              ].map((x) => (
                <div key={x.k}>
                  <dt className="text-xs text-slate-500">{x.k}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-slate-900">
                    {formatVND(x.v)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      ) : null}

      {/* 검사 */}
      {inspections.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('grant.inspection')}</h2>
          <Table
            head={[t('common.createdAt'), t('common.status'), t('grant.findings'), t('grant.recovery')]}
          >
            {inspections.map((i, idx) => (
              <Tr key={idx}>
                <Td className="tabular-nums text-slate-600">{i.inspected_at.slice(0, 10)}</Td>
                <Td>
                  <Badge tone={i.result === 'PASS' ? 'green' : i.result === 'FAIL' ? 'red' : 'amber'}>
                    {i.result}
                  </Badge>
                </Td>
                <Td className="text-slate-700 wrap-anywhere">{i.findings ?? '-'}</Td>
                <Td className="tabular-nums">
                  {Number(i.recovery_amount) > 0 ? formatVND(i.recovery_amount) : '-'}
                </Td>
              </Tr>
            ))}
          </Table>
        </section>
      ) : null}
    </div>
  );
}
