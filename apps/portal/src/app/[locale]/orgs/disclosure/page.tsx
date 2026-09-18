import { listFederations, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Table, Tr, Td, ExportButton } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/**
 * 경영공시 (공개).
 *
 * 대한체육회 '회원종목단체 경영공시'와 같은 항목 구성이다.
 *   단체명(현지어/영문) · 등록년도 · 가입일 · 전화 · 홈페이지 · 이메일 · 주소
 *
 * 이 페이지가 있는 이유: 정부 산하 체계에서 투명성은 신뢰의 근거이고,
 * 후원사가 협회를 검토할 때 가장 먼저 보는 자료이기도 하다.
 */
export default async function DisclosurePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const rows = await listFederations().catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.disclosure')}
        subtitle={`${rows.length}`}
        right={<ExportButton kind="orgs" label={t('common.export')} params={{ locale }} />}
      />
      {rows.length === 0 ? (
        <EmptyState message={t('org.empty')} />
      ) : (
        <Table
          head={[
            t('org.name'), 'Code', t('org.effectiveFrom'),
            t('org.phone'), t('org.email'), t('org.website'), t('org.memberCount'),
          ]}
        >
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium text-slate-900 wrap-anywhere">
                {pick(r.name_i18n, locale)}
                {r.name_i18n.en ? (
                  <span className="block text-xs font-normal text-slate-500">{r.name_i18n.en}</span>
                ) : null}
              </Td>
              <Td className="font-mono text-xs text-slate-500">{r.display_id ?? '-'}</Td>
              <Td className="tabular-nums text-slate-600">
                {r.established_at ?? r.effective_from}
              </Td>
              <Td className="tabular-nums text-slate-600">{r.phone ?? '-'}</Td>
              <Td className="text-slate-600 wrap-anywhere">{r.email ?? '-'}</Td>
              <Td className="text-slate-600 wrap-anywhere">
                {r.website ? (
                  <a href={r.website} className="hover:underline" rel="noopener noreferrer" target="_blank">
                    {r.website}
                  </a>
                ) : (
                  '-'
                )}
              </Td>
              <Td className="tabular-nums">{r.member_count}</Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
