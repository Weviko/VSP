'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  issueOtp, verifyOtpAndLogin, logout, getCurrentUser, canUseWorkspace, AuthError,
} from '@vsp/core-admin';
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE } from '@/lib/session';
import { cookies } from 'next/headers';
import { isLocale } from '@vsp/web-shared/i18n/config';
// 부수효과: 알림 어댑터(Zalo ZNS / 콘솔)를 등록한다. 이게 로드돼야 issueOtp 가 OTP 를 실제로 보낸다.
import '@/lib/adapters';

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : null;
}

export async function requestOtp(
  phone: string,
  locale?: string
): Promise<{ ok: boolean; devCode?: string; error?: string }> {
  try {
    // 화면 언어로 OTP 문구를 보낸다(한국어 UI 담당자에겐 한국어). 발송은 issueOtp 안에서 어댑터로 이뤄진다.
    const res = await issueOtp(phone, {
      ip: await clientIp(),
      locale: isLocale(locale ?? '') ? (locale as 'vi' | 'en' | 'ko') : 'vi',
    });
    return { ok: true, devCode: res.devCode };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function verifyOtp(
  phone: string,
  code: string,
  locale: string
): Promise<{ ok: boolean; error?: string }> {
  let destination: string;
  try {
    const h = await headers();
    const session = await verifyOtpAndLogin(phone, code, {
      ip: await clientIp(),
      userAgent: h.get('user-agent'),
    });
    await setSessionCookie(session.token, session.expiresAt);
    // 누구나 로그인할 수 있으므로, 업무 역할이 있는 사람만 업무 화면으로 보낸다
    const user = await getCurrentUser(session.token);
    destination = canUseWorkspace(user) ? `/${locale}/admin` : `/${locale}/my`;
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.code };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  redirect(destination);
}

export async function signOut(locale: string): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await logout(token);
  await clearSessionCookie();
  redirect(`/${locale}`);
}
