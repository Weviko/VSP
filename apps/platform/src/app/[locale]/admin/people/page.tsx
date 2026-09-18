import Link from 'next/link';
import { query, t as pick, type UUID, type I18nText } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, ButtonLink, Badge, Table, Tr, Td, EmptyState, ExportButton } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface PersonRow {
  id: UUID;
  full_name: string;
  phone: string | null;
  birth_year: number | null;
  gender: string | null;
  roles: string[] | null;
  org_names: I18nText[] | null;
}

/**
 * 인원 목록.
 * 한 사람이 여러 조직에서 여러 역할을 가질 수 있으므로 역할·소속을 묶어서 보여준다.
 * (선수이면서 지도자, 지방연맹 직원이면서 심판인 경우가 흔하다)
 */
export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale: raw } = await params;
  const { q } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let rows: PersonRow[] | null = null;
  let error: string | undefined;
  try {
    rows = await query<PersonRow>(
      `SELECT p.id, p.full_name, p.phone, p.gender,
              EXTRACT(YEAR FROM p.birth_date)::int AS birth_year,
              array_remove(array_agg(DISTINCT m.role_code), NULL) AS roles,
              array_remove(array_agg(DISTINCT o.name_i18n), NULL) AS org_names
         FROM core.person p
         LEFT JOIN core.org_member m ON m.person_id = p.id
                AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
         LEFT JOIN core.organization o ON o.id = m.org_id
        WHERE p.deleted_at IS NULL
          AND ($1::text IS NULL OR p.full_name ILIKE '%' || $1 || '%')
        GROUP BY p.id
        ORDER BY p.full_name
        LIMIT 200`,
      [q || null]
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('person.title')}
        subtitle={rows ? `${rows.length}` : undefined}
        right={
          <>
            <ExportButton kind="athletes" label={t('common.export')} params={{ q, locale }} />
            <ButtonLink href={`/${locale}/admin/people/new`}>{t('person.addMember')}</ButtonLink>
          </>
        }
      />

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder={t('person.name')}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t('common.search')}
        </button>
      </form>

      {!rows ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : rows.length === 0 ? (
        <EmptyState message={t('person.empty')} />
      ) : (
        <Table
          head={[t('person.name'), t('person.birth'), t('person.gender'), t('org.phone'), t('person.role'), t('nav.organizations')]}
        >
          {rows.map((p) => (
            <Tr key={p.id}>
              <Td>
                <Link
                  href={`/${locale}/admin/people/${p.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {p.full_name}
                </Link>
              </Td>
              <Td className="tabular-nums text-slate-600">{p.birth_year ?? '-'}</Td>
              <Td className="text-slate-600">{p.gender ?? '-'}</Td>
              <Td className="tabular-nums text-slate-600">{p.phone ?? '-'}</Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {(p.roles ?? []).length === 0 ? (
                    <span className="text-slate-400">-</span>
                  ) : (
                    (p.roles ?? []).map((r) => <Badge key={r}>{r}</Badge>)
                  )}
                </span>
              </Td>
              <Td className="text-slate-600 wrap-anywhere">
                {(p.org_names ?? []).map((n) => pick(n, locale)).join(', ') || '-'}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
