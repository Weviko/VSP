import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getOrganization, getAncestors, getOrgTree, listLevelTypes, query, t as pick,
} from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { MemberForm } from './MemberForm';
import { updateOrgForm, deactivateOrgForm, reactivateOrgForm, mergeOrgForm, searchOrgsAction, endMembershipForm } from '../actions';
import { OrgPicker } from '@/components/OrgPicker';
import { requireWorkspace } from '@/lib/session';

const ORG_EDIT_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'];

export const dynamic = 'force-dynamic';

interface MemberRow {
  id: string;
  person_id: string;
  full_name: string;
  phone: string | null;
  role_code: string;
  title: string | null;
  valid_from: string;
  valid_to: string | null;
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ locale: string; orgId: string }>;
}) {
  const { locale: raw, orgId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  // 비활성(deleted_at)된 조직도 보고 되살릴 수 있게 포함해서 조회한다
  const org = await getOrganization(orgId, { includeDeleted: true });
  if (!org) notFound();
  const deactivated = Boolean(org.deleted_at);
  const orgName = org.name_i18n as Record<string, string>;
  const editInput = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  const [ancestors, children, levels, members, roles] = await Promise.all([
    getAncestors(orgId),
    getOrgTree({ rootId: orgId, includeInactive: true, maxDepth: 1 }),
    listLevelTypes(),
    query<MemberRow>(
      `SELECT m.id, m.person_id, p.full_name, p.phone, m.role_code, m.title,
              m.valid_from, m.valid_to
         FROM core.org_member m
         JOIN core.person p ON p.id = m.person_id
        WHERE m.org_id = $1
        ORDER BY m.role_code, p.full_name`,
      [orgId]
    ),
    query<{ code: string; name_i18n: Record<string, string> }>(
      `SELECT code, name_i18n FROM core.role ORDER BY code`
    ),
  ]);

  const levelLabel = new Map(levels.map((l) => [l.code, pick(l.name_i18n, locale)]));
  const roleLabel = new Map(roles.map((r) => [r.code, pick(r.name_i18n, locale)]));
  const directChildren = children[0]?.children ?? [];

  return (
    <div className="space-y-6">
      <div>
        {ancestors.length > 0 ? (
          <nav className="mb-2 text-sm text-slate-500">
            {ancestors.map((a) => (
              <span key={a.id}>
                <Link href={`/${locale}/admin/organizations/${a.id}`} className="hover:underline">
                  {pick(a.name_i18n, locale)}
                </Link>
                <span className="mx-1">/</span>
              </span>
            ))}
          </nav>
        ) : null}
        <PageHeader
          title={pick(org.name_i18n, locale)}
          subtitle={levelLabel.get(org.level_type) ?? org.level_type}
          right={
            <Badge tone={deactivated ? 'red' : statusTone(org.status)}>
              {deactivated ? t('org.deactivated') : t(`status.${org.status}`)}
            </Badge>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Code</p>
          <p className="mt-1 font-mono text-sm">{org.display_id ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('org.region')}</p>
          <p className="mt-1 text-sm">{org.region_code ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('org.effectiveFrom')}</p>
          <p className="mt-1 text-sm tabular-nums">{org.effective_from}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">{t('org.effectiveTo')}</p>
          <p className="mt-1 text-sm tabular-nums">{org.effective_to ?? '—'}</p>
        </Card>
      </div>

      {/* 정보 수정 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('org.editInfo')}</h2>
        <Card>
          <form action={updateOrgForm.bind(null, locale, org.id)} className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.name')} (VI)</span>
              <input name="name_vi" required defaultValue={orgName.vi ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.name')} (EN)</span>
              <input name="name_en" defaultValue={orgName.en ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.name')} (KO)</span>
              <input name="name_ko" defaultValue={orgName.ko ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.shortName')}</span>
              <input name="short_name" defaultValue={org.short_name ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.region')}</span>
              <input name="region_code" defaultValue={org.region_code ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.taxCode')}</span>
              <input name="tax_code" defaultValue={org.tax_code ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.phone')}</span>
              <input name="phone" defaultValue={org.phone ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('org.email')}</span>
              <input name="email" type="email" defaultValue={org.email ?? ''} className={editInput} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">{t('common.status')}</span>
              <select name="status" defaultValue={ORG_EDIT_STATUSES.includes(org.status) ? org.status : 'ACTIVE'} className={editInput}>
                {ORG_EDIT_STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
            </div>
          </form>
        </Card>
      </section>

      {org.merged_into_id ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {t('org.mergedInto')}:{' '}
          <Link
            href={`/${locale}/admin/organizations/${org.merged_into_id}`}
            className="font-medium underline"
          >
            {org.merged_into_id}
          </Link>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('person.title')}</h2>
        {members.length === 0 ? (
          <EmptyState message={t('person.empty')} />
        ) : (
          <Table head={[t('person.name'), t('person.role'), 'Title', t('org.phone'), t('org.effectiveTo'), '']}>
            {members.map((m) => (
              <Tr key={m.id}>
                <Td className="font-medium text-slate-900">{m.full_name}</Td>
                <Td>
                  <Badge>{roleLabel.get(m.role_code) ?? m.role_code}</Badge>
                </Td>
                <Td className="text-slate-600">{m.title ?? '—'}</Td>
                <Td className="tabular-nums text-slate-600">{m.phone ?? '—'}</Td>
                <Td className="tabular-nums text-slate-500">{m.valid_to ?? '—'}</Td>
                <Td>
                  {m.valid_to ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <form action={endMembershipForm.bind(null, locale, orgId)}>
                      <input type="hidden" name="member_id" value={m.id} />
                      <button className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600">{t('org.endMembership')}</button>
                    </form>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}

        <MemberForm
          orgId={orgId}
          locale={locale}
          roles={roles.map((r) => ({ code: r.code, label: pick(r.name_i18n, locale) }))}
          labels={{
            add: t('person.addMember'),
            name: t('person.name'),
            phone: t('org.phone'),
            role: t('person.role'),
            save: t('common.save'),
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('org.tree')} ({directChildren.length})
        </h2>
        {directChildren.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('org.name'), t('org.levelType'), t('org.region'), t('common.status')]}>
            {directChildren.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link
                    href={`/${locale}/admin/organizations/${c.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {pick(c.name_i18n, locale)}
                  </Link>
                </Td>
                <Td className="text-slate-600">{levelLabel.get(c.level_type) ?? c.level_type}</Td>
                <Td className="text-slate-600">{c.region_code ?? '—'}</Td>
                <Td>
                  <Badge tone={statusTone(c.status)}>{t(`status.${c.status}`)}</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>

      {/* 조직 통합 (후속 조직으로 흡수) */}
      {!deactivated && !org.merged_into_id ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">{t('org.merge')}</h2>
          <Card>
            <p className="mb-3 text-sm text-slate-600">{t('org.mergeHint')}</p>
            <form action={mergeOrgForm.bind(null, locale, org.id)} className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <span className="mb-1 block text-sm text-slate-600">{t('org.mergedInto')}</span>
                <OrgPicker
                  name="into_id"
                  required
                  onSearch={searchOrgsAction.bind(null, locale)}
                  labels={{ search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') }}
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{t('org.effectiveOn')}</span>
                <input type="date" name="effective_on" required className={editInput} />
              </label>
              <button className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">{t('org.merge')}</button>
            </form>
          </Card>
        </section>
      ) : null}

      {/* 비활성 / 되살리기 */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm text-slate-600">{t('org.deactivateHint')}</p>
        {deactivated ? (
          <form action={reactivateOrgForm.bind(null, locale, org.id)}>
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">{t('org.reactivate')}</button>
          </form>
        ) : directChildren.length > 0 ? (
          <p className="text-sm text-amber-700">{t('org.deactivateBlocked')}</p>
        ) : (
          <form action={deactivateOrgForm.bind(null, locale, org.id)}>
            <button className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">{t('org.deactivate')}</button>
          </form>
        )}
      </section>
    </div>
  );
}
