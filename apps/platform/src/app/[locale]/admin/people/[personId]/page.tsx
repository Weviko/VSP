import Link from 'next/link';
import { getPerson, listMemberships, t as pick, type UUID } from '@vsp/core-admin';
import { listRegistrations, REG_TYPE_LABELS } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, EmptyState, Badge, statusTone, Table, Tr, Td } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { updatePersonForm, deactivatePersonForm, reactivatePersonForm } from './actions';

export const dynamic = 'force-dynamic';

/**
 * 인물 상세·수정 (업무자용).
 * 오탈자·연락처 정정, 소속·등록 확인, 비활성/되살리기를 한 화면에서. 신분증 해시는 다루지 않는다.
 */
export default async function PersonDetail({
  params,
}: {
  params: Promise<{ locale: string; personId: string }>;
}) {
  const { locale: raw, personId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const person = await getPerson(personId as UUID);
  if (!person) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('person.title')} />
        <EmptyState message={t('common.noData')} />
        <Link href={`/${locale}/admin/people`} className="text-sm text-sky-700 hover:underline">← {t('person.title')}</Link>
      </div>
    );
  }

  const [memberships, regs] = await Promise.all([
    listMemberships(personId as UUID).catch(() => []),
    listRegistrations({ personId: personId as UUID, limit: 50 }).catch(() => []),
  ]);

  const deactivated = Boolean(person.deleted_at);
  const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/people`} className="text-sm text-sky-700 hover:underline">← {t('person.title')}</Link>
      </div>

      <PageHeader
        title={person.full_name}
        subtitle={person.display_id ?? undefined}
        right={
          <Badge tone={deactivated ? 'red' : statusTone(person.status)}>
            {deactivated ? t('person.deactivated') : t(`status.${person.status}`)}
          </Badge>
        }
      />

      {/* 수정 */}
      <Card>
        <form action={updatePersonForm.bind(null, locale, person.id)} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.name')}</span>
            <input name="full_name" required defaultValue={person.full_name} className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.nameLatin')}</span>
            <input name="name_latin" defaultValue={person.name_latin ?? ''} className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.gender')}</span>
            <select name="gender" defaultValue={person.gender ?? ''} className={input}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.birthDate')}</span>
            <input name="birth_date" type="date" defaultValue={person.birth_date ?? ''} className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('org.phone')}</span>
            <input name="phone" defaultValue={person.phone ?? ''} className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.email')}</span>
            <input name="email" type="email" defaultValue={person.email ?? ''} className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">{t('person.address')}</span>
            <input name="address" defaultValue={person.address ?? ''} className={input} />
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
            {person.id_doc_type ? (
              <span className="text-xs text-slate-400">{t('person.idDoc')}: {person.id_doc_type}{person.id_verified_at ? ' ✓' : ''}</span>
            ) : null}
          </div>
        </form>
      </Card>

      {/* 소속 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{t('person.memberships')}</h2>
        {memberships.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{t('person.noMemberships')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {memberships.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium text-slate-800 wrap-anywhere">{pick(m.name_i18n, locale)}</span>
                <span className="flex items-center gap-2">
                  {m.title ? <span className="text-slate-500">{m.title}</span> : null}
                  <Badge>{m.role_code}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 등록 */}
      {regs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">{t('person.registrations')}</h2>
          <Table head={[t('nav.sports'), t('reg.type'), t('org.name'), t('common.status')]}>
            {regs.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link href={`/${locale}/admin/registrations/${r.id}`} className="text-sky-700 hover:underline">{pick(r.sport_name, locale)}</Link>
                </Td>
                <Td className="text-slate-600">{pick(REG_TYPE_LABELS[r.reg_type] ?? { vi: r.reg_type }, locale)}</Td>
                <Td className="text-slate-600 wrap-anywhere">{pick(r.org_name, locale)}</Td>
                <Td><Badge tone={statusTone(r.status)}>{t(`status.${r.status}`)}</Badge></Td>
              </Tr>
            ))}
          </Table>
        </section>
      ) : null}

      {/* 비활성 / 되살리기 */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm text-slate-600">{t('person.deactivateHint')}</p>
        {deactivated ? (
          <form action={reactivatePersonForm.bind(null, locale, person.id)}>
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">{t('person.reactivate')}</button>
          </form>
        ) : (
          <form action={deactivatePersonForm.bind(null, locale, person.id)}>
            <button className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">{t('person.deactivate')}</button>
          </form>
        )}
      </section>
    </div>
  );
}
