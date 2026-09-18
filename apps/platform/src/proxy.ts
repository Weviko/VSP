import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, DEFAULT_LOCALE } from '@vsp/web-shared/i18n/config';

// lib/session 을 import 하면 next/headers 가 proxy 번들에 끌려온다. 이름만 맞춘다.
const SESSION_COOKIE = 'vsp_session';

/**
 * 언어 라우팅 (Next.js 16의 proxy 규약 — 구 middleware).
 * 경로에 언어가 없으면 Accept-Language를 보고 붙여준다.
 * 베트남 사용자가 대부분이므로 폴백은 vi.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const locale = LOCALES.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (locale) {
    // 로그인 쿠키가 아예 없으면 업무·회원 화면에 들어가기 전에 로그인으로 보낸다.
    // 쿠키만 보는 빠른 1차 거름이다 — 진짜 권한 확인은 화면·액션의 requireWorkspace 가 한다.
    const guarded = pathname.startsWith(`/${locale}/admin`) || pathname.startsWith(`/${locale}/my`);
    if (guarded && !req.cookies.get(SESSION_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/login`;
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const accept = req.headers.get('accept-language') ?? '';
  const preferred =
    LOCALES.find((l) => accept.toLowerCase().startsWith(l)) ??
    LOCALES.find((l) => accept.toLowerCase().includes(l)) ??
    DEFAULT_LOCALE;

  const url = req.nextUrl.clone();
  url.pathname = `/${preferred}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 자원과 API는 통과
  matcher: ['/((?!api|_next|.*\.[\w]+$).*)'],
};
