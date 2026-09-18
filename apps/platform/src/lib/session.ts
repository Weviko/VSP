import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser, canUseWorkspace, type CurrentUser } from '@vsp/core-admin';

export const SESSION_COOKIE = 'vsp_session';

export interface SessionResult {
  user: CurrentUser | null;
  /** DB 자체에 연결하지 못한 경우. "로그인 안 됨"과 구분해야 한다. */
  dbError?: string;
}

/**
 * 현재 로그인 사용자.
 * 한 번의 요청 안에서는 레이아웃·화면·액션이 몇 번 불러도 DB 조회는 한 번만 한다.
 */
export const currentUser = cache(async (): Promise<SessionResult> => {
  // cookies() 는 try 밖에서 부른다. Next 는 이 호출이 던지는 신호로 "요청마다 렌더링할 화면"을 판별하는데,
  // catch 가 그 신호를 삼키면 DB 오류로 오인하고 로그인 화면이 정적으로 굳어버린다.
  const jar = await cookies();
  try {
    const user = await getCurrentUser(jar.get(SESSION_COOKIE)?.value);
    return { user };
  } catch (e) {
    return { user: null, dbError: e instanceof Error ? e.message : String(e) };
  }
});

/*
 * ── 권한 확인 (데이터 접근 계층) ─────────────────────────────────────────
 *
 * 레이아웃에서 막는 것만으로는 안전하지 않다. App Router 는 화면 전환 때 레이아웃을 다시 실행하지 않고,
 * 레이아웃이 하위 화면의 렌더링을 막지도 않는다(Next 16 인증 가이드). 서버 액션은 화면을 거치지 않고
 * 직접 호출되는 공개 종단점이다. 그래서 화면·액션·라우트마다 여기 함수를 부른다.
 * scripts/check-boundaries 가 빠진 곳이 없는지 검사한다.
 *
 * DB 오류일 때는 통과시키지 않는다. 사용자 조회만 실패하고 다음 조회가 성공하면
 * 권한 확인 없이 업무 데이터가 나가게 된다 — 실패하면 닫힌 쪽으로.
 */

/** 업무 화면용. 권한이 없으면 적절한 곳으로 보낸다. */
export async function requireWorkspace(locale: string): Promise<CurrentUser> {
  const { user, dbError } = await currentUser();
  if (dbError) throw new Error(`DB unavailable: ${dbError}`);
  if (!user) redirect(`/${locale}/login`);
  if (!canUseWorkspace(user)) redirect(`/${locale}/my`);
  return user;
}

/** 회원 서비스 화면용. 로그인만 되어 있으면 된다 — 자기 기록만 보여주기 때문이다. */
export async function requireMember(locale: string): Promise<CurrentUser> {
  const { user, dbError } = await currentUser();
  if (dbError) throw new Error(`DB unavailable: ${dbError}`);
  if (!user) redirect(`/${locale}/login`);
  return user;
}

/** 서버 액션·라우트용. 리다이렉트 대신 null 을 돌려주고, 부른 쪽이 FORBIDDEN 으로 답한다. */
export async function workUserOrNull(): Promise<CurrentUser | null> {
  const { user } = await currentUser();
  return canUseWorkspace(user) ? user : null;
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
