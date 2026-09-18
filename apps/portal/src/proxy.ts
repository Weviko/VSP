import { NextResponse, type NextRequest } from 'next/server';
import { LOCALES, DEFAULT_LOCALE } from '@vsp/web-shared/i18n/config';

/**
 * 언어 라우팅 (Next.js 16의 proxy 규약 — 구 middleware).
 * 경로에 언어가 없으면 Accept-Language를 보고 붙여준다.
 * 베트남 사용자가 대부분이므로 폴백은 vi.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return NextResponse.next();

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
