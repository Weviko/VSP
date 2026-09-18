import { listGrantDisclosures, formatVND, t as pick } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, EmptyState, Table, Tr, Td, Badge, ExportButton } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/**
 * 보조금 공시 (공개).
 *
 * 검사를 통과한 건만 나온다. 집행 중인 수치는 계속 바뀌어 오해를 사기 때문이다.
 * 확정된 숫자만 공개하는 것이 한국 경영공시와 같은 방식이며 분쟁의 소지가 없다.
 */
export default async function GrantDisclosurePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale: raw } = await params;
  const { year } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const rows = await listGrantDisclosures(year ? Number(year) : undefined).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('grant.title')} · ${t('grant.disclosure')}`}
        subtitle={
          locale === 'ko'
            ? '검사를 마친 교부 건만 공개합니다.'
            : locale === 'en'
              ? 'Only awards that completed inspection are published.'
              : 'Chỉ công khai các khoản đã hoàn tất kiểm tra.'
        }
        right={
          <ExportButton kind="disclosure" label={t('common.export')} params={{ year, locale }} />
        }
      />

      {rows.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <Table
          head={[
            t('grant.fiscalYear'), t('org.name'), t('grant.program'),
            t('grant.awarded'), t('grant.executed'), t('grant.returned'), t('grant.inspection'),
          ]}
        >
          {rows.map((r) => {
            const s = r.summary as Record<string, string>;
            return (
              <Tr key={r.award_id}>
                <Td className="tabular-nums text-slate-600">{r.fiscal_year}</Td>
                <Td className="font-medium text-slate-900 wrap-anywhere">
                  {pick(r.org_name, locale)}
                </Td>
                <Td className="text-slate-600 wrap-anywhere">{pick(r.program_name, locale)}</Td>
                <Td className="tabular-nums font-medium">{formatVND(s.awarded)}</Td>
                <Td className="tabular-nums">{formatVND(s.executed)}</Td>
                <Td className="tabular-nums text-slate-600">{formatVND(s.returned)}</Td>
                <Td>
                  <Badge tone={s.result === 'PASS' ? 'green' : 'amber'}>{s.result}</Badge>
                </Td>
              </Tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
