import Link from 'next/link';
import { listIngestionQueue, listForms, t as pick, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, EmptyState, Table, Tr, Td, Badge } from '@vsp/web-shared/ui';
import { requireWorkspace, currentUser } from '@/lib/session';
import { IngestNew } from './IngestNew';

export const dynamic = 'force-dynamic';

/** 추출 신뢰도를 색으로 (높음=초록, 보통=주황, 낮음/없음=빨강). */
function confTone(c: number | null): 'green' | 'amber' | 'red' {
  const n = Number(c ?? 0);
  return n >= 0.8 ? 'green' : n >= 0.6 ? 'amber' : 'red';
}

/**
 * AI 서류 등록 — 검토 대기함.
 *
 * 서류가 올라오면 AI 가 공식 폼 초안을 만들고, 여기서 사람이 확정한다.
 * 신뢰도가 낮은(사람이 꼭 봐야 하는) 건이 위로 온다.
 */
export default async function IngestQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { dbError } = await currentUser();

  if (dbError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t('nav.ingest')}</h1>
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const [queue, allForms] = await Promise.all([listIngestionQueue(), listForms()]);

  // 서식은 코드별 최신 버전만 (등록 선택지 + 제목 매핑에 쓴다)
  const byCode = new Map<string, { code: string; title: string; id: UUID }>();
  const titleById = new Map<string, string>();
  for (const f of allForms) {
    const title = pick(f.title_i18n, locale);
    titleById.set(f.id, title);
    const prev = byCode.get(f.code);
    if (!prev) byCode.set(f.code, { code: f.code, title, id: f.id });
  }
  const forms = [...byCode.values()].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.ingest')} subtitle={t('ingest.subtitle')} />

      <Card className="border-sky-200 bg-sky-50/50">
        <p className="text-sm text-sky-900">{t('ingest.safety')}</p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('ingest.newTitle')}</h2>
        <IngestNew
          locale={locale}
          forms={forms}
          labels={{
            pickForm: t('ingest.pickForm'),
            start: t('ingest.start'),
            hint: t('ingest.newHint'),
            upload: t('common.upload'),
            uploading: t('common.uploading'),
            remove: t('common.delete'),
            tooLarge: t('common.fileTooLarge'),
            badType: t('common.fileBadType'),
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('ingest.queueTitle')}</h2>
        {queue.length === 0 ? (
          <EmptyState message={t('ingest.queueEmpty')} />
        ) : (
          <Table head={[t('nav.documents'), t('ingest.extractor'), t('ingest.confidence'), t('ingest.checks'), t('common.createdAt'), '']}>
            {queue.map((j) => {
              const conf = j.overall_confidence == null ? null : Number(j.overall_confidence);
              return (
                <Tr key={j.id}>
                  <Td className="font-medium text-slate-900">{titleById.get(j.form_id) ?? j.form_id.slice(0, 8)}</Td>
                  <Td className="text-slate-600">{j.extractor ?? '—'}</Td>
                  <Td>
                    <Badge tone={confTone(conf)}>{conf == null ? '—' : `${Math.round(conf * 100)}%`}</Badge>
                  </Td>
                  <Td className="tabular-nums text-slate-600">
                    {j.validation.length > 0 ? (
                      <Badge tone="amber">{t('ingest.needsReview')} {j.validation.length}</Badge>
                    ) : (
                      <Badge tone="green">OK</Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-slate-500">{j.created_at.slice(0, 10)}</Td>
                  <Td>
                    <Link href={`/${locale}/admin/ingest/${j.id}`} className="text-sm font-medium text-sky-700 hover:underline">
                      {t('ingest.review')} →
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}
