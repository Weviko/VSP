import { verifyCertificate, t as pick, type VerificationResult } from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card, Badge } from '@vsp/web-shared/ui';

export const dynamic = 'force-dynamic';

/**
 * 증명서 진위확인 (로그인 불필요).
 *
 * 대회 현장에서 종이 증명서를 받은 사람이 바로 확인할 수 있어야 한다.
 * 결과에는 존재 여부와 최소 정보만 보여준다.
 * 코드가 유출돼도 개인정보가 새지 않아야 하기 때문이다.
 */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale: raw } = await params;
  const { code } = await searchParams;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const result: VerificationResult | null = code
    ? await verifyCertificate(code).catch(() => ({ valid: false }) as VerificationResult)
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={t('cert.verify')} />

      <form method="get" className="flex gap-2">
        <input
          name="code"
          defaultValue={code ?? ''}
          placeholder="ABCD-EFG-HJKL"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase"
        />
        <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t('cert.verify')}
        </button>
      </form>

      {result ? (
        result.valid ? (
          <Card className={result.revoked ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}>
            <div className="flex items-center gap-2">
              <Badge tone={result.revoked ? 'amber' : 'green'}>{result.revoked ? t('cert.revoked') : t('cert.valid')}</Badge>
              <span className="font-mono text-xs text-slate-500">{result.docNo}</span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">{t('person.name')}</dt>
                <dd className="font-medium text-slate-900">{result.subjectName ?? '-'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">{t('org.name')}</dt>
                <dd className="text-slate-700">
                  {result.orgName ? pick(result.orgName, locale) : '-'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">{t('cert.issuedAt')}</dt>
                <dd className="tabular-nums text-slate-700">
                  {result.issuedAt ? result.issuedAt.slice(0, 10) : '-'}
                </dd>
              </div>
            </dl>
          </Card>
        ) : (
          <Card className="border-red-300 bg-red-50">
            <Badge tone="red">{t('cert.invalid')}</Badge>
          </Card>
        )
      ) : null}
    </div>
  );
}
