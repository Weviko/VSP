import Link from 'next/link';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, ExportButton } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { OrgImportPanel } from './OrgImportPanel';

export const dynamic = 'force-dynamic';

/**
 * 조직 엑셀 일괄 등록 — 온보딩. 템플릿 내려받아 채우고 → 업로드 → 검증 → 확정.
 * 조직은 트리라서 상위를 조직 코드(display_id)로 참조한다. 상위→하위 순서로 확정 등록된다.
 * 실제 등록은 사람이 미리보기 후 확정한다(자동 등록 없음).
 */
export default async function OrgImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const labels: Record<string, string> = {
    file: t('import.file'), upload: t('common.upload'), uploading: t('common.uploading'),
    remove: t('common.delete'), tooLarge: t('common.fileTooLarge'), badType: t('common.fileBadType'),
    validate: t('import.validate'), working: t('import.working'), commit: t('import.commit'),
    committed: t('import.committed'), inserted: t('import.inserted'), skipped: t('import.skipped'),
    total: t('import.total'), valid: t('import.valid'), errors: t('import.errors'),
    row: t('import.row'), result: t('common.status'),
    colId: t('orgImport.colId'), colName: t('orgImport.colName'),
    colLevel: t('orgImport.colLevel'), colParent: t('orgImport.colParent'),
    'e.REQUIRED_ID': t('orgImport.e.REQUIRED_ID'), 'e.REQUIRED_NAME': t('orgImport.e.REQUIRED_NAME'),
    'e.BAD_LEVEL': t('orgImport.e.BAD_LEVEL'), 'e.DUP_FILE': t('orgImport.e.DUP_FILE'),
    'e.DUP_DB': t('orgImport.e.DUP_DB'), 'e.BAD_PARENT': t('orgImport.e.BAD_PARENT'),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${locale}/admin/organizations`} className="text-sm text-sky-700 hover:underline">← {t('org.title')}</Link>
      </div>
      <PageHeader title={t('orgImport.title')} subtitle={t('orgImport.subtitle')} />

      <Card className="flex flex-wrap items-center justify-between gap-3 border-sky-200 bg-sky-50/50">
        <p className="text-sm text-sky-900">{t('orgImport.templateHint')}</p>
        <ExportButton kind="org-template" label={t('import.downloadTemplate')} params={{ locale }} />
      </Card>

      <OrgImportPanel locale={locale} labels={labels} />
    </div>
  );
}
