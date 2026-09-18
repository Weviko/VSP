import Link from 'next/link';
import { getForm, listMemberships, t as pickI18n, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, EmptyState } from '@vsp/web-shared/ui';
import { MyRegistrationForm } from './MyRegistrationForm';
import { requireMember } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 회원 셀프 경기인 등록 신청.
 * 소속 단체를 골라 본인 명의로 신청 → 기존 2단계 전자결재로 승인.
 * 소속이 없으면 신청할 수 없다(먼저 단체 가입/배치가 필요).
 */
export default async function MyNewRegistrationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const user = await requireMember(locale);
  const t = getMessages(locale);

  let form = null;
  let error: string | undefined;
  try {
    form = await getForm('ATHLETE_REG');
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const memberships = user.personId ? await listMemberships(user.personId).catch(() => []) : [];
  const orgOptions = memberships.map((m) => ({ id: m.org_id as string, label: pickI18n(m.name_i18n, locale) }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/${locale}/my`} className="text-sm text-sky-700 hover:underline">← {t('my.title')}</Link>
      </div>

      {!form ? (
        <>
          <PageHeader title={t('nav.registrations')} />
          <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
        </>
      ) : (
        <>
          <PageHeader
            title={pickI18n(form.title_i18n, locale)}
            subtitle={form.sla_days ? `SLA: ${form.sla_days}d` : undefined}
          />
          {orgOptions.length === 0 ? (
            <EmptyState message={t('my.noClub')} />
          ) : (
            <MyRegistrationForm
              form={form}
              locale={locale}
              orgOptions={orgOptions}
              labels={{
                submit: t('common.submit'),
                required: t('common.required'),
                upload: t('common.upload'),
                uploading: t('common.uploading'),
                remove: t('common.delete'),
                fileTooLarge: t('common.fileTooLarge'),
                fileBadType: t('common.fileBadType'),
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
