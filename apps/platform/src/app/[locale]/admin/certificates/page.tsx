import Link from 'next/link';
import { listCertificates, getOrgTree, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { IssueCertForm } from './IssueCertForm';
import { revokeCertForm } from './actions';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CertificatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let data = null;
  let error: string | undefined;
  try {
    const [certs, tree] = await Promise.all([listCertificates(), getOrgTree()]);
    const orgs: Array<{ id: string; label: string }> = [];
    const walk = (nodes: typeof tree, depth = 0) => {
      for (const n of nodes) {
        orgs.push({ id: n.id, label: `${'- '.repeat(depth)}${pick(n.name_i18n, locale)}` });
        walk(n.children, depth + 1);
      }
    };
    walk(tree);
    data = { certs, orgs };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('cert.title')} />
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cert.title')}
        subtitle={`${data.certs.length}`}
        right={
          <Link
            href={`/${locale}/verify`}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            {t('cert.verify')}
          </Link>
        }
      />

      <IssueCertForm
        locale={locale}
        orgs={data.orgs}
        labels={{
          issue: t('cert.issue'),
          name: t('person.name'),
          type: t('cert.type'),
          org: t('org.name'),
          code: t('cert.verifyCode'),
        }}
      />

      {data.certs.length === 0 ? (
        <EmptyState message={t('cert.empty')} />
      ) : (
        <Table
          head={['No.', t('cert.type'), t('person.name'), t('org.name'), t('cert.verifyCode'), t('cert.issuedAt'), '']}
        >
          {data.certs.map((c) => (
            <Tr key={c.id}>
              <Td className="font-mono text-xs text-slate-500">{c.doc_no}</Td>
              <Td className="text-slate-700">{c.doc_type}</Td>
              <Td className="font-medium text-slate-900">{c.subject_name ?? '-'}</Td>
              <Td className="text-slate-600 wrap-anywhere">
                {c.org_name ? pick(c.org_name, locale) : '-'}
              </Td>
              <Td className="font-mono text-sm">{c.verify_code}</Td>
              <Td className="tabular-nums text-slate-500">
                {c.issued_at ? c.issued_at.slice(0, 10) : '-'}
              </Td>
              <Td>
                {c.revoked_at ? (
                  <Badge tone="red">{t('cert.revoked')}</Badge>
                ) : (
                  <form action={revokeCertForm.bind(null, locale)} className="flex items-center gap-1">
                    <input type="hidden" name="cert_id" value={c.id} />
                    <input name="reason" placeholder={t('cert.revokeReason')} className="w-28 rounded border border-slate-300 px-2 py-1 text-xs" />
                    <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">{t('cert.revoke')}</button>
                  </form>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
