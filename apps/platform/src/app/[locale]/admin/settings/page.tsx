import Link from 'next/link';
import { listForms, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Badge, statusTone, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { NewFormButton } from './NewFormButton';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 설정 — 서식 관리.
 *
 * 이 화면이 있어야 체육회에서 받은 서식을 개발자 없이 반영할 수 있다.
 * 협의에서 "이 칸 추가해주세요"가 나왔을 때 바로 처리하는 곳이다.
 */
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let forms = null;
  let error: string | undefined;
  try {
    forms = await listForms();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.formsHint')}
        right={<NewFormButton locale={locale} label={t('settings.newForm')} />}
      />

      {!forms ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : forms.length === 0 ? (
        <EmptyState message={t('common.noData')} />
      ) : (
        <Table
          head={[
            t('settings.code'), t('settings.formTitle'), t('settings.version'),
            t('settings.fields'), t('settings.submissions'), 'SLA', t('common.status'),
          ]}
        >
          {forms.map((f) => (
            <Tr key={f.id}>
              <Td className="font-mono text-xs text-slate-500">{f.code}</Td>
              <Td>
                <Link
                  href={`/${locale}/admin/settings/forms/${f.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {pick(f.title_i18n, locale)}
                </Link>
              </Td>
              <Td className="tabular-nums text-slate-600">v{f.version}</Td>
              <Td className="tabular-nums">{f.field_count}</Td>
              <Td className="tabular-nums text-slate-500">{f.submission_count}</Td>
              <Td className="tabular-nums text-slate-600">
                {f.sla_days ? `${f.sla_days}d` : '-'}
              </Td>
              <Td>
                <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
