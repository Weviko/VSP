import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { LocaleSwitch } from '@vsp/web-shared/LocaleSwitch';

/**
 * 대외 웹사이트 공통 껍데기 — 네이버 스포츠형 3단 머리.
 *
 *   ① 유틸리티 줄   기관소개 · 체육단체 · 경영공시 · 공개정보 · 증명서 진위확인 | 언어 | 로그인
 *   ② 종목 탭 줄    로고 · 홈 · 축구 · 배구 · 태권도 … · 전체 종목  (가로 스크롤, 데이터에서 생성)
 *   ③ 기능 줄       일정 · 결과 · 순위 · 선수 · 뉴스
 *
 * 네이버 스포츠 첫 화면(2026-09-14 확인)은 종목 탭이 1단, 기능 메뉴(오늘의 경기·연재·랭킹 등)가 2단이다.
 * 방문자가 종목을 먼저 고르기 때문이다. 같은 순서를 따른다.
 *
 * 한국은 기관 사이트·업무 포털·데이터 현황판이 따로 있어 방문자가 어디로 갈지 헷갈렸다.
 * 여기서는 방문 목적의 중심(경기·선수)을 크게, 법정 공개 정보는 유틸리티 줄에 둔다.
 *
 * 디자인은 문체부 협의 뒤 IT팀이 입힌다. 지금은 구획과 순서만 확정한다.
 * 이 영역이 검색 유입과 광고 수익의 기반이므로 서버 렌더링을 유지한다.
 */

export interface NavLink {
  key: string;
  href: string;
  label: string;
}

export function PublicShell({
  locale,
  appName,
  appShort,
  loginHref,
  loginLabel,
  sections,
  sportTabs,
  utilities,
  children,
}: {
  locale: Locale;
  appName: string;
  appShort: string;
  loginHref: string;
  loginLabel: string;
  sections: NavLink[];
  sportTabs: NavLink[];
  utilities: NavLink[];
  children: ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        {/* ① 유틸리티 줄 */}
        <div className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5">
            <ul className="flex gap-3 overflow-x-auto text-xs text-slate-600">
              {utilities.map((u) => (
                <li key={u.key} className="shrink-0">
                  <Link href={u.href} className="hover:text-slate-900">
                    {u.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex shrink-0 items-center gap-2">
              <LocaleSwitch current={locale} />
              {/* 로그인은 업무 플랫폼에서 한다. 이 사이트에는 계정 기능이 없다. */}
              <a
                href={loginHref}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {loginLabel}
              </a>
            </div>
          </div>
        </div>

        {/* ② 종목 탭 줄 — 1단 */}
        <div className="border-b border-slate-200">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4">
            <Link href={`/${locale}`} className="flex shrink-0 items-baseline gap-2 py-3">
              <span className="text-lg font-bold text-slate-900">{appShort}</span>
              <span className="hidden text-sm text-slate-500 lg:inline">{appName}</span>
            </Link>
            <nav className="min-w-0 flex-1">
              <ul className="flex gap-1 overflow-x-auto">
                {sportTabs.map((s) => (
                  <li key={s.key} className="shrink-0">
                    <Link
                      href={s.href}
                      className="block px-3 py-3 text-sm font-semibold text-slate-800 hover:text-slate-950"
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* ③ 기능 줄 — 2단 */}
        <nav className="border-b border-slate-200 bg-white">
          <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {sections.map((s) => (
              <li key={s.key} className="shrink-0">
                <Link
                  href={s.href}
                  className="block px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* ad slot: HOME_TOP (정의만 되어 있고 비활성). 광고는 이 사이트에만 둔다 — 업무 플랫폼에는 두지 않는다. */}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 text-sm text-slate-500">
          <span>{appName} · VSP</span>
          <ul className="flex gap-3">
            {utilities.map((u) => (
              <li key={u.key}>
                <Link href={u.href} className="hover:text-slate-800">
                  {u.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </>
  );
}
