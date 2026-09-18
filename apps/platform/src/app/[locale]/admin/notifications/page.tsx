import { getNotificationSummary, listRecentNotifications } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { NotifyActions } from './NotifyActions';
import { PersonPicker } from '@/components/PersonPicker';
import { composeNotificationForm, searchPersonsAction } from './actions';

const NOTIFY_CHANNELS = ['ZALO', 'SMS', 'EMAIL', 'INAPP'];

export const dynamic = 'force-dynamic';

const STATUS_CLASS: Record<string, string> = {
  SENT: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  QUEUED: 'bg-amber-50 text-amber-800',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

/** 전화번호를 목록에서 부분 가린다(내부 화면이라도 대량 표시엔 마스킹). 0912345678 → 0912***678 */
function maskPhone(p: string | null): string {
  if (!p) return '—';
  return p.length >= 9 ? `${p.slice(0, 4)}***${p.slice(-2)}` : p;
}

/**
 * 알림 큐 운영 — 채널·상태별 현황, 최근 발송, 수동 발송(flush)·기한 알림 생성.
 * 기한 알림·OTP 외 알림이 실제로 나갔는지 담당자가 여기서 확인한다.
 */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let summary = null;
  let recent = null;
  let error: string | undefined;
  try {
    [summary, recent] = await Promise.all([getNotificationSummary(), listRecentNotifications(50)]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const queued = (summary ?? []).filter((r) => r.status === 'QUEUED').reduce((a, r) => a + r.n, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t('notify.title')} subtitle={t('notify.subtitle')} />

      {!summary || !recent ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : (
        <>
          {/* 현황 + 운영 버튼 */}
          <Card className="space-y-4">
            {summary.length === 0 ? (
              <p className="text-sm text-slate-500">{t('notify.empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.map((r) => (
                  <span key={`${r.channel}-${r.status}`} className={'rounded px-2.5 py-1 text-sm ' + (STATUS_CLASS[r.status] ?? 'bg-slate-100 text-slate-600')}>
                    <span className="font-mono text-xs">{r.channel}</span>
                    <span className="mx-1">·</span>
                    {t(`status.${r.status}`)}
                    <b className="ml-1.5 tabular-nums">{r.n}</b>
                  </span>
                ))}
              </div>
            )}
            <NotifyActions
              locale={locale}
              queued={queued}
              labels={{
                enqueue: t('notify.enqueueReminders'), flush: t('notify.flush'),
                flushConfirm: t('notify.flushConfirm'), working: t('import.working'),
                flushResult: t('notify.flushResult'), enqueueResult: t('notify.enqueueResult'),
                sent: t('status.SENT'), failed: t('status.FAILED'), skipped: t('status.SKIPPED'),
                queuedLabel: t('status.QUEUED'),
              }}
            />
          </Card>

          {/* 알림 작성 */}
          <Card>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-sky-700">＋ {t('notify.compose')}</summary>
              <form action={composeNotificationForm.bind(null, locale)} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  <div>
                    <span className="mb-1 block text-sm text-slate-600">{t('notify.recipient')}</span>
                    <PersonPicker
                      name="person_id"
                      required
                      onSearch={searchPersonsAction.bind(null, locale)}
                      labels={{ search: t('picker.search'), noResults: t('picker.noResults'), minChars: t('picker.minChars'), change: t('picker.change') }}
                    />
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">{t('notify.channel')}</span>
                    <select name="channel" defaultValue="ZALO" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                      {NOTIFY_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{t('notify.message')}</span>
                  <textarea name="message" required rows={3} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </label>
                <button className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{t('notify.sendOne')}</button>
              </form>
            </details>
          </Card>

          {/* 최근 알림 */}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">{t('notify.recent')}</h2>
            {recent.length === 0 ? (
              <EmptyState message={t('notify.empty')} />
            ) : (
              <Table head={[t('notify.channel'), t('notify.template'), t('notify.to'), t('common.status'), t('notify.createdAt'), t('notify.sentAt')]}>
                {recent.map((n) => (
                  <Tr key={n.id}>
                    <Td className="font-mono text-xs text-slate-500">{n.channel}</Td>
                    <Td className="text-slate-700 wrap-anywhere">{n.template_code ?? '—'}</Td>
                    <Td className="tabular-nums text-slate-600">{maskPhone(n.to)}</Td>
                    <Td>
                      <span className={'rounded px-1.5 py-0.5 text-xs ' + (STATUS_CLASS[n.status] ?? 'bg-slate-100 text-slate-600')}>
                        {t(`status.${n.status}`)}
                      </span>
                    </Td>
                    <Td className="tabular-nums text-slate-400">{n.created_at.slice(0, 16).replace('T', ' ')}</Td>
                    <Td className="tabular-nums text-slate-400">{n.sent_at ? n.sent_at.slice(0, 16).replace('T', ' ') : '—'}</Td>
                  </Tr>
                ))}
              </Table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
