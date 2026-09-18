import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  listPrograms, listApplications, listAwards,
  formatVND, t as pick, type UUID,
} from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { AwardDecider } from './AwardDecider';
import { setProgramStatusForm, applyToProgramForm } from '../../actions';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 공모 상세 — 신청을 받아 교부를 결정하는 화면.
 * 신청 목록에서 바로 교부액을 정해 결정할 수 있게 한다.
 */
export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ locale: string; programId: string }>;
}) {
  const { locale: raw, programId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const programs = await listPrograms().catch(() => []);
  const program = programs.find((p) => p.id === programId);
  if (!program) notFound();

  const [applications, awards] = await Promise.all([
    listApplications(programId as UUID),
    listAwards({ programId: programId as UUID }),
  ]);

  const awardedOrgIds = new Set(awards.map((a) => a.grantee_org_id));

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
          title={pick(program.name_i18n, locale)}
          subtitle={`${program.fiscal_year} · ${program.code ?? ''}`}
          right={<Badge tone={statusTone(program.status)}>{program.status}</Badge>}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">{t('pay.amount')}</p>
          <p className="mt-1 font-medium tabular-nums">{formatVND(program.total_budget)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('grant.awarded')}</p>
          <p className="mt-1 font-medium tabular-nums">{formatVND(program.awarded_total)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('grant.applications')}</p>
          <p className="mt-1 font-medium tabular-nums">{program.application_count}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('event.entryPeriod')}</p>
          <p className="mt-1 text-sm tabular-nums">
            {program.applies_from ?? '-'} ~ {program.applies_to ?? '-'}
          </p>
        </Card>
      </div>

      {/* 상태 전환 + 신청 */}
      <div className="flex flex-wrap items-center gap-3">
        {program.status === 'OPEN' ? (
          <form action={setProgramStatusForm.bind(null, locale, programId)}>
            <input type="hidden" name="status" value="CLOSED" />
            <button className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">{t('grant.close')}</button>
          </form>
        ) : (
          <form action={setProgramStatusForm.bind(null, locale, programId)}>
            <input type="hidden" name="status" value="OPEN" />
            <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600">{t('grant.open')}</button>
          </form>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-sky-700">＋ {t('grant.apply')}</summary>
          <form action={applyToProgramForm.bind(null, locale, programId)} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-slate-600">{t('grant.requestedAmount')}</span>
              <input name="requested_amount" type="number" min="0" required className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-600">{t('grant.selfFunding')}</span>
              <input name="self_funding" type="number" min="0" className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-slate-600">{t('grant.summary')}</span>
              <input name="summary" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('grant.apply')}</button>
          </form>
        </details>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('grant.applications')} ({applications.length})
        </h2>
        {applications.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={[
              t('org.name'), t('pay.amount'), 'Self', t('common.status'), '',
            ]}
          >
            {applications.map((a) => (
              <Tr key={a.id}>
                <Td className="font-medium text-slate-900 wrap-anywhere">
                  {pick(a.org_name, locale)}
                </Td>
                <Td className="tabular-nums">{formatVND(a.requested_amount)}</Td>
                <Td className="tabular-nums text-slate-600">{formatVND(a.self_funding)}</Td>
                <Td>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </Td>
                <Td>
                  {awardedOrgIds.has(a.applicant_org_id) ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <AwardDecider
                      locale={locale}
                      programId={programId}
                      applicationId={a.id}
                      granteeOrgId={a.applicant_org_id}
                      defaultAmount={a.requested_amount}
                      defaultSelfFunding={a.self_funding}
                      labels={{
                        decide: t('grant.decide'),
                        amount: t('pay.amount'),
                        decisionNo: t('grant.decisionNo'),
                        account: t('grant.account'),
                        dueOn: t('grant.dueOn'),
                        save: t('common.save'),
                      }}
                    />
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('grant.awards')} ({awards.length})
        </h2>
        {awards.length === 0 ? (
          <EmptyState message={t('grant.empty')} />
        ) : (
          <Table
            head={[
              t('org.name'), t('grant.decisionNo'), t('grant.awarded'),
              t('grant.rate'), t('common.status'),
            ]}
          >
            {awards.map((a) => (
              <Tr key={a.id}>
                <Td className="wrap-anywhere">
                  <Link
                    href={`/${locale}/admin/grants/awards/${a.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {pick(a.org_name, locale)}
                  </Link>
                </Td>
                <Td className="font-mono text-xs text-slate-500">{a.decision_no ?? '-'}</Td>
                <Td className="tabular-nums font-medium">{formatVND(a.awarded_amount)}</Td>
                <Td className="tabular-nums text-slate-600">{a.execution_rate}%</Td>
                <Td>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
