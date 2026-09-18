import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-bold text-slate-900">{t('auth.loginTitle')}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">{t('app.name')}</p>
      <LoginForm
        locale={locale}
        labels={{
          phone: t('auth.phone'),
          otp: t('auth.otp'),
          sendOtp: t('auth.sendOtp'),
          verifyOtp: t('auth.verifyOtp'),
          otpSentTemplate: t('auth.otpSent'),
        }}
        errors={{
          INVALID_PHONE: t('auth.err.INVALID_PHONE'),
          THROTTLED: t('auth.err.THROTTLED'),
          NO_CHALLENGE: t('auth.err.NO_CHALLENGE'),
          EXPIRED: t('auth.err.EXPIRED'),
          WRONG_CODE: t('auth.err.WRONG_CODE'),
          TOO_MANY_ATTEMPTS: t('auth.err.TOO_MANY_ATTEMPTS'),
          OTP_SEND_FAILED: t('auth.err.OTP_SEND_FAILED'),
          OTP_NOT_CONFIGURED: t('auth.err.OTP_NOT_CONFIGURED'),
          default: t('auth.err.default'),
        }}
      />
    </main>
  );
}
