import { listOperators, listWorkspaceRoles, canUseWorkspace, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Table, Tr, Td, Badge, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { PersonPicker } from '@/components/PersonPicker';
import { OrgPicker } from '@/components/OrgPicker';
import { assignRoleForm, revokeRoleForm, searchPersonsAction, searchOrgsAction } from './actions';

/**
 * 담당자·권한 관리 (RBAC) — 누가 어느 조직에서 어떤 업무 역할을 갖는지 한 곳에서 본다.
 *
 * 화면·서버액션마다 requireWorkspace/workUserOrNull 로 막고 있지만, "누가 그 권한을 가졌나"를
 * 사람이 관리·회수하는 창구가 없었다. 여기서 배정·회수하고 core.audit 에 남긴다.
 * 배정·회수 자체는 최고관리자(SYS_ADMIN)·정부관리자(GOV_ADMIN)만 — 그 외 담당자는 열람만.
 */
export const dynamic = 'force-dynamic';

const ROLE_TONE: Record<string, 'blue' | 'amber' | 'red' | 'neutral'> = {
  SYS_ADMIN: 'red', GOV_ADMIN: 'red', ORG_HEAD: 'blue', ORG_FINANCE: 'amber',
};

const ERR_KEY: Record<string, string> = {
  FORBIDDEN: 'access.errForbidden',
  INVALID_ROLE: 'access.errRole',
  INPUT: 'access.errInput',
};

export default async function OperatorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ err?: string; added?: string; revoked?: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const user = await requireWorkspace(locale);
  const t = getMessages(locale);
  const sp = await searchParams;

  const [operators, roles] = await Promise.all([
    listOperators().catch(() => []),
    listWorkspaceRoles().catch(() => []),
  ]);
  // 배정/회수 권한: 최고관리자·정부관리자. 그 외는 목록 열람만.
  const canManage = canUseWorkspace(user) && user.roleCodes.some((r) => r === 'SYS_ADMIN' || r === 'GOV_ADMIN');

  const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader title={t('access.operators')} />

      {sp.err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {t(ERR_KEY[sp.err] ?? 'access.errInput')}
        </p>
      ) : null}
      {sp.added ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {t('access.assignedOk')}
        </p>
      ) : null}
      {sp.revoked ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
          {t('access.revokedOk')}
        </p>
      ) : null}

      {/* 권한 부여 — 관리 권한자에게만 보인다 */}
      {canManage ? (
        <Card>
          <form action={assignRoleForm.bind(null, locale)} className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">{t('access.assign')}</p>
            <p className="text-xs text-slate-500">{t('access.addHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('access.pickPerson')}</span>
                <PersonPicker
                  name="person_id"
                  required
                  onSearch={searchPersonsAction.bind(null, locale)}
                  labels={{ search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') }}
                />
              </div>
              <div className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('access.pickOrg')}</span>
                <OrgPicker
                  name="org_id"
                  required
                  onSearch={searchOrgsAction.bind(null, locale)}
                  labels={{ search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') }}
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('person.role')}</span>
                <select name="role_code" required defaultValue="" className={input}>
                  <option value="" disabled>{t('access.pickRole')}</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>{pick(r.name_i18n, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('access.jobTitle')}</span>
                <input name="title" className={input} />
              </label>
            </div>
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              {t('access.assign')}
            </button>
          </form>
        </Card>
      ) : null}

      {operators.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <Table
          head={[t('person.name'), t('org.name'), t('person.role'), t('access.jobTitle'), t('access.since'), '']}
        >
          {operators.map((m) => (
            <Tr key={m.member_id}>
              <Td className="font-medium text-slate-900 wrap-anywhere">{m.full_name}</Td>
              <Td className="text-slate-700 wrap-anywhere">{pick(m.org_name, locale)}</Td>
              <Td><Badge tone={ROLE_TONE[m.role_code] ?? 'neutral'}>{pick(m.role_name, locale)}</Badge></Td>
              <Td className="text-slate-600 wrap-anywhere">{m.title ?? '—'}</Td>
              <Td className="tabular-nums text-slate-400">{m.valid_from?.slice(0, 10)}</Td>
              <Td>
                {canManage ? (
                  <form action={revokeRoleForm.bind(null, locale)}>
                    <input type="hidden" name="member_id" value={m.member_id} />
                    <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                      {t('access.revoke')}
                    </button>
                  </form>
                ) : null}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
