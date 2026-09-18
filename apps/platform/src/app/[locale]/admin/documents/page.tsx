import Link from 'next/link';
import {
  listInbox, listOutbox, listConcurrenceRequests, listRegister,
  t as pick, type UUID,
} from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import {
  PageHeader, Badge, statusTone, Table, Tr, Td, EmptyState, ExportButton,
} from '@vsp/web-shared/ui';
import { currentUser, requireWorkspace } from '@/lib/session';
import { ReceiveButton, ConcurrenceButtons } from './DocTools';

export const dynamic = 'force-dynamic';

type Tab = 'inbox' | 'outbox' | 'concurrence' | 'register';

/**
 * 공문함.
 *
 * 받은 공문은 회신 기한이 지난 것을 맨 위로 올린다. 결재함과 같은 원칙이다.
 * 기관 간 공문은 회신 지연이 곧 행정 지연이고, 감사 지적 사항이 된다.
 */
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale: raw } = await params;
  const { tab: tabParam } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { user, dbError } = await currentUser();

  const tab: Tab =
    tabParam === 'outbox' || tabParam === 'concurrence' || tabParam === 'register'
      ? tabParam
      : 'inbox';

  if (dbError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('doc.title')} />
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const orgId = (user?.activeOrgId ?? null) as UUID | null;

  const [inbox, outbox, concurrences, produced, received] = await Promise.all([
    orgId ? listInbox(orgId) : [],
    orgId ? listOutbox(orgId) : [],
    orgId ? listConcurrenceRequests(orgId) : [],
    orgId ? listRegister(orgId, 'PRODUCED') : [],
    orgId ? listRegister(orgId, 'RECEIVED') : [],
  ]);

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'inbox', label: t('doc.inbox'), count: inbox.length },
    { key: 'outbox', label: t('doc.outbox'), count: outbox.length },
    { key: 'concurrence', label: t('doc.concurrence'), count: concurrences.length },
    { key: 'register', label: t('doc.register'), count: produced.length + received.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('doc.title')}
        right={
          <>
            {/* 대장은 감사에 제출하는 자료라 탭에서 보는 그대로 내보낼 수 있어야 한다 */}
            {tab === 'register' ? (
              <>
                <ExportButton
                  kind="register"
                  label={`${t('doc.outbox')} ${t('common.export')}`}
                  params={{ type: 'PRODUCED', locale }}
                />
                <ExportButton
                  kind="register"
                  label={`${t('doc.inbox')} ${t('common.export')}`}
                  params={{ type: 'RECEIVED', locale }}
                />
              </>
            ) : null}
          <Link
            href={`/${locale}/admin/documents/new`}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            + {t('doc.newDoc')}
          </Link>
          </>
        }
      />

      <nav className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={`/${locale}/admin/documents?tab=${x.key}`}
            className={
              'rounded px-3 py-1.5 text-sm ' +
              (tab === x.key
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-100')
            }
          >
            {x.label}
            {x.count > 0 ? (
              <span className="ml-1.5 tabular-nums opacity-70">{x.count}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === 'inbox' ? (
        inbox.length === 0 ? (
          <EmptyState message={t('doc.empty')} />
        ) : (
          <Table
            head={[
              t('doc.docNo'), t('common.status'), t('doc.sender'),
              t('doc.replyDue'), t('doc.receiptNo'), '',
            ]}
          >
            {inbox.map((d) => (
              <Tr key={d.id}>
                <Td className="wrap-anywhere">
                  <Link
                    href={`/${locale}/admin/documents/${d.document_id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {d.title}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{d.doc_no}</span>
                  {d.urgency !== 'NORMAL' ? (
                    <Badge tone="red">{d.urgency}</Badge>
                  ) : null}
                  {d.recipient_type === 'CC' ? (
                    <span className="ml-2 text-xs text-slate-400">{t('doc.cc')}</span>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </Td>
                <Td className="text-slate-600 wrap-anywhere">{pick(d.from_org_name, locale)}</Td>
                <Td
                  className={
                    'tabular-nums ' + (d.overdue ? 'font-semibold text-red-600' : 'text-slate-600')
                  }
                >
                  {d.reply_due_on ?? '-'}
                </Td>
                <Td className="font-mono text-xs text-slate-500">{d.receipt_no ?? '-'}</Td>
                <Td>
                  {d.status === 'SENT' ? (
                    <ReceiveButton dispatchId={d.id} locale={locale} label={t('doc.receive')} />
                  ) : null}
                </Td>
              </Tr>
            ))}
          </Table>
        )
      ) : null}

      {tab === 'outbox' ? (
        outbox.length === 0 ? (
          <EmptyState message={t('doc.empty')} />
        ) : (
          <Table head={[t('doc.docNo'), t('doc.recipient'), t('common.status'), t('common.createdAt')]}>
            {outbox.map((d) => (
              <Tr key={d.id}>
                <Td className="wrap-anywhere">
                  <Link
                    href={`/${locale}/admin/documents/${d.document_id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {d.title}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{d.doc_no}</span>
                </Td>
                <Td className="text-slate-600 wrap-anywhere">
                  {pick(d.to_org_name, locale)}
                  {d.recipient_type === 'CC' ? (
                    <span className="ml-1 text-xs text-slate-400">({t('doc.cc')})</span>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </Td>
                <Td className="tabular-nums text-slate-500">{d.sent_at.slice(0, 10)}</Td>
              </Tr>
            ))}
          </Table>
        )
      ) : null}

      {tab === 'concurrence' ? (
        concurrences.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('doc.docNo'), t('common.createdAt'), '']}>
            {concurrences.map((c) => (
              <Tr key={c.id}>
                <Td className="wrap-anywhere">
                  <Link
                    href={`/${locale}/admin/documents/${c.document_id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {c.title}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{c.doc_no}</span>
                </Td>
                <Td className="tabular-nums text-slate-500">{c.requested_at.slice(0, 10)}</Td>
                <Td>
                  <ConcurrenceButtons
                    concurrenceId={c.id}
                    locale={locale}
                    labels={{ agree: t('doc.agree'), disagree: t('doc.disagree'), opinion: t('doc.opinion') }}
                  />
                </Td>
              </Tr>
            ))}
          </Table>
        )
      ) : null}

      {tab === 'register' ? (
        <div className="space-y-6">
          {[
            { title: t('doc.produced'), rows: produced },
            { title: t('doc.received'), rows: received },
          ].map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">
                {section.title} ({section.rows.length})
              </h2>
              {section.rows.length === 0 ? (
                <EmptyState message={t('common.noData')} />
              ) : (
                <Table head={['No.', t('doc.docNo'), t('common.createdAt')]}>
                  {section.rows.map((r) => (
                    <Tr key={r.register_no}>
                      <Td className="font-mono text-xs text-slate-600">{r.register_no}</Td>
                      <Td className="wrap-anywhere">
                        <span className="text-slate-900">{r.title}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">{r.doc_no}</span>
                      </Td>
                      <Td className="tabular-nums text-slate-500">
                        {r.registered_at.slice(0, 10)}
                      </Td>
                    </Tr>
                  ))}
                </Table>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
