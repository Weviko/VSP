import Link from 'next/link';
import { listRegistrations, REG_TYPE_LABELS, type RegType } from '@vsp/sport-domain';
import { t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import {
  PageHeader, ButtonLink, Badge, statusTone, Table, Tr, Td, EmptyState, ExportButton,
} from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { locale: raw } = await params;
  const { type, status } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let rows = null;
  let error: string | undefined;
  try {
    rows = await listRegistrations({
      regType: (type as RegType) ?? null,
      status: status ?? null,
      limit: 200,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const types = Object.keys(REG_TYPE_LABELS) as RegType[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reg.title')}
        right={
          <>
            <ExportButton kind="registrations" label={t('common.export')} params={{ locale }} />
            <ButtonLink href={`/${locale}/admin/registrations/new`}>{t('reg.newAthlete')}</ButtonLink>
          </>
        }
      />

      <nav className="flex flex-wrap gap-2">
        <Link
          href={`/${locale}/admin/registrations`}
          className={
            'rounded px-3 py-1.5 text-sm ' +
            (!type ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
          }
        >
          {t('common.total')}
        </Link>
        {types.map((rt) => (
          <Link
            key={rt}
            href={`/${locale}/admin/registrations?type=${rt}`}
            className={
              'rounded px-3 py-1.5 text-sm ' +
              (type === rt
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
            }
          >
            {pick(REG_TYPE_LABELS[rt], locale)}
          </Link>
        ))}
      </nav>

      {!rows ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : rows.length === 0 ? (
        <EmptyState message={t('reg.empty')} />
      ) : (
        <Table
          head={[
            t('person.name'), t('reg.type'), t('nav.sports'),
            t('org.name'), t('person.birth'), t('common.status'),
          ]}
        >
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium">
                <Link href={`/${locale}/admin/registrations/${r.id}`} className="text-sky-700 hover:underline">{r.full_name}</Link>
              </Td>
              <Td>
                <Badge>{pick(REG_TYPE_LABELS[r.reg_type] ?? { vi: r.reg_type }, locale)}</Badge>
              </Td>
              <Td className="text-slate-600">{pick(r.sport_name, locale)}</Td>
              <Td className="text-slate-600 wrap-anywhere">{pick(r.org_name, locale)}</Td>
              <Td className="tabular-nums text-slate-600">
                {r.birth_date ? r.birth_date.slice(0, 4) : '—'}
              </Td>
              <Td>
                <Badge tone={statusTone(r.status)}>{t(`status.${r.status}`)}</Badge>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
