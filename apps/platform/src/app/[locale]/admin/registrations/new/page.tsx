import { getForm, t as pickI18n } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { RegistrationForm } from './RegistrationForm';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function NewRegistrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let form = null;
  let error: string | undefined;
  try {
    form = await getForm('ATHLETE_REG');
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!form) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t('nav.registrations')}</h1>
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{pickI18n(form.title_i18n, locale)}</h1>
        {form.description_i18n ? (
          <p className="mt-1 text-sm text-slate-600">{pickI18n(form.description_i18n, locale)}</p>
        ) : null}
        {form.sla_days ? (
          <p className="mt-2 inline-block rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">
            SLA: {form.sla_days}d
          </p>
        ) : null}
      </div>

      <RegistrationForm
        form={form}
        locale={locale}
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
    </div>
  );
}
