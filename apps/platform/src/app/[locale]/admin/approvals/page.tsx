import { listPendingFor, t as pickI18n } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { currentUser, requireWorkspace } from '@/lib/session';
import { ApprovalRow } from './ApprovalRow';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { user, dbError } = await currentUser();

  if (dbError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t('nav.approvals')}</h1>
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const items = user?.personId
    ? await listPendingFor({
        personId: user.personId,
        orgId: user.activeOrgId,
        roleCodes: user.roleCodes,
      })
    : [];

  const overdueCount = items.filter((i) => i.overdue).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('nav.approvals')}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('common.total')}: <strong className="tabular-nums">{items.length}</strong>
            {overdueCount > 0 ? (
              <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                overdue {overdueCount}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('common.noData')}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ApprovalRow
              key={item.instance_id}
              locale={locale}
              instanceId={item.instance_id}
              formTitle={pickI18n(item.form_title, locale)}
              stepName={pickI18n(item.step_name, locale)}
              stepNo={item.step_no}
              submittedAt={item.submitted_at}
              dueAt={item.due_at}
              overdue={item.overdue}
              labels={{
                approve: t('common.approve'),
                reject: t('common.reject'),
                return: t('common.return'),
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
