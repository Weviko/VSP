import Link from 'next/link';
import {
  getGrantPerspective, getGrantorSummary, getGranteeSummary,
  listPrograms, listAwards, formatVND, t as pick, type UUID,
} from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import {
  PageHeader, StatCard, Card, Badge, statusTone, Table, Tr, Td, EmptyState, ExportButton,
} from '@vsp/web-shared/ui';
import { currentUser, requireWorkspace } from '@/lib/session';
import { createProgramForm } from './actions';

const THIS_YEAR = new Date().getFullYear();

export const dynamic = 'force-dynamic';

/**
 * 보조금 홈.
 *
 * 같은 데이터를 두 입장에서 본다. 관심사가 완전히 달라 한 화면에 섞으면 둘 다 못 쓴다.
 *   주는 쪽: 누구에게 얼마를 줬고 제대로 썼는가
 *   받는 쪽: 얼마 남았고 언제까지 정산하는가
 * 로그인한 조직의 역할로 자동 판단해 필요한 쪽을 먼저 보여준다.
 */

/** 집행률 막대. 차트 라이브러리 없이 비율만 보여준다. */
function Rate({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 shrink-0 overflow-hidden rounded bg-slate-100">
        <div
          className={'h-full rounded ' + (pct >= 90 ? 'bg-emerald-600' : 'bg-slate-700')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-slate-600">{pct}%</span>
    </div>
  );
}

export default async function GrantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { user, dbError } = await currentUser();

  if (dbError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('grant.title')} />
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const orgId = (user?.activeOrgId ?? null) as UUID | null;
  const perspective = orgId ? await getGrantPerspective(orgId) : 'NONE';
  const showGrantor = perspective === 'GRANTOR' || perspective === 'BOTH' || perspective === 'NONE';
  const showGrantee = perspective === 'GRANTEE' || perspective === 'BOTH';

  const [grantorSum, granteeSum, programs, myAwards] = await Promise.all([
    showGrantor && orgId ? getGrantorSummary(orgId) : null,
    showGrantee && orgId ? getGranteeSummary(orgId) : null,
    listPrograms(orgId ? { ownerOrgId: orgId } : {}),
    orgId ? listAwards({ granteeOrgId: orgId }) : [],
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('grant.title')}
        subtitle={perspective === 'BOTH' ? `${t('grant.grantor')} · ${t('grant.grantee')}` : undefined}
        right={<ExportButton kind="grants" label={t('common.export')} params={{ locale }} />}
      />

      {showGrantee && granteeSum ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('grant.grantee')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('grant.awarded')} value={formatVND(granteeSum.awarded_total)} />
            <StatCard label={t('grant.executed')} value={formatVND(granteeSum.executed_total)} />
            <StatCard label={t('grant.remaining')} value={formatVND(granteeSum.remaining)} />
            <StatCard
              label={t('grant.overdue')}
              value={granteeSum.overdue}
              hint={`${t('grant.dueSoon')} ${granteeSum.due_soon}`}
            />
          </div>

          {myAwards.length === 0 ? (
            <EmptyState message={t('grant.empty')} />
          ) : (
            <Table
              head={[
                t('grant.program'), t('grant.decisionNo'), t('grant.awarded'),
                t('grant.rate'), t('grant.dueOn'), t('common.status'),
              ]}
            >
              {myAwards.map((a) => (
                <Tr key={a.id}>
                  <Td className="wrap-anywhere">
                    <Link
                      href={`/${locale}/admin/grants/awards/${a.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {pick(a.program_name, locale)}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs text-slate-500">{a.decision_no ?? '-'}</Td>
                  <Td className="tabular-nums font-medium">{formatVND(a.awarded_amount)}</Td>
                  <Td>
                    <Rate value={a.execution_rate} />
                  </Td>
                  <Td
                    className={
                      'tabular-nums ' + (a.overdue ? 'font-semibold text-red-600' : 'text-slate-600')
                    }
                  >
                    {a.settlement_due_on ?? '-'}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </section>
      ) : null}

      {showGrantor ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('grant.grantor')}</h2>

          <Card>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-sky-700">＋ {t('grant.newProgram')}</summary>
              <form action={createProgramForm.bind(null, locale)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm lg:col-span-2">
                  <span className="mb-1 block text-slate-600">{t('grant.program')} (VI)</span>
                  <input name="name_vi" required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('grant.fiscalYear')}</span>
                  <input name="fiscal_year" type="number" defaultValue={THIS_YEAR} required className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('grant.program')} (EN)</span>
                  <input name="name_en" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('grant.program')} (KO)</span>
                  <input name="name_ko" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('grant.programType')}</span>
                  <select name="program_type" defaultValue="OPEN_CALL" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                    <option value="OPEN_CALL">{t('grant.openCall')}</option>
                    <option value="DESIGNATED">{t('grant.designated')}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('grant.budget')}</span>
                  <input name="total_budget" type="number" min="0" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
                </label>
                <div className="flex items-end">
                  <button className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('grant.newProgram')}</button>
                </div>
              </form>
            </details>
          </Card>

          {grantorSum ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t('grant.awarded')} value={formatVND(grantorSum.awarded_total)} />
              <StatCard label={t('grant.rate')} value={`${grantorSum.execution_rate}%`} />
              <StatCard label={t('grant.unsettled')} value={grantorSum.unsettled} />
              <StatCard label={t('grant.overdue')} value={grantorSum.overdue} />
            </div>
          ) : null}

          {programs.length === 0 ? (
            <EmptyState message={t('grant.empty')} />
          ) : (
            <Table
              head={[
                t('grant.program'), t('grant.fiscalYear'), t('grant.applications'),
                t('grant.awarded'), t('common.status'),
              ]}
            >
              {programs.map((p) => (
                <Tr key={p.id}>
                  <Td className="wrap-anywhere">
                    <Link
                      href={`/${locale}/admin/grants/programs/${p.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {pick(p.name_i18n, locale)}
                    </Link>
                    {p.code ? (
                      <span className="ml-2 font-mono text-xs text-slate-400">{p.code}</span>
                    ) : null}
                  </Td>
                  <Td className="tabular-nums text-slate-600">{p.fiscal_year}</Td>
                  <Td className="tabular-nums">{p.application_count}</Td>
                  <Td className="tabular-nums">{formatVND(p.awarded_total)}</Td>
                  <Td>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </section>
      ) : null}
    </div>
  );
}
