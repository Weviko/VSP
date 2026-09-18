import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, ExportButton } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { ImportPanel } from './ImportPanel';

export const dynamic = 'force-dynamic';

/**
 * 엑셀 일괄 등록 — 온보딩. 템플릿 내려받아 채우고 → 업로드 → 검증 → 확정.
 * 실제 등록은 사람이 미리보기 후 확정한다(자동 등록 없음). 중복은 CCCD 해시로 잡는다.
 */
export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
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
    row: t('import.row'), name: t('import.name'), gender: t('import.gender'),
    birth: t('import.birth'), result: t('common.status'),
    'e.REQUIRED_NAME': t('import.e.REQUIRED_NAME'), 'e.BAD_GENDER': t('import.e.BAD_GENDER'),
    'e.BAD_DATE': t('import.e.BAD_DATE'), 'e.DUP_FILE': t('import.e.DUP_FILE'), 'e.DUP_DB': t('import.e.DUP_DB'),
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />

      <Card className="flex flex-wrap items-center justify-between gap-3 border-sky-200 bg-sky-50/50">
        <p className="text-sm text-sky-900">{t('import.templateHint')}</p>
        <ExportButton kind="person-template" label={t('import.downloadTemplate')} params={{ locale }} />
      </Card>

      <ImportPanel locale={locale} labels={labels} />
    </div>
  );
}
