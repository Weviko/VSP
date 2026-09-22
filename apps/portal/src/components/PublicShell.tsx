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
      {/* 브랜드 액센트 바 */}
      <div className="h-1 w-full bg-gradient-to-r from-[#15607A] via-[#1c7fa0] to-[#15607A]" />

      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        {/* ① 유틸리티 줄 */}
        <div className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5">
            <ul className="flex gap-4 overflow-x-auto text-xs text-slate-500">
              {utilities.map((u) => (
                <li key={u.key} className="shrink-0">
                  <Link href={u.href} className="transition-colors hover:text-[#15607A]">
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
                className="rounded-md bg-[#15607A] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#0e4356]"
              >
                {loginLabel}
              </a>
            </div>
          </div>
        </div>

        {/* ② 로고 + 종목 탭 줄 */}
        <div className="border-b border-slate-200">
          <div className="mx-auto flex max-w-7xl items-center gap-5 px-4">
            <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2.5 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#15607A] text-sm font-bold tracking-tight text-white shadow-sm">
                VSP
              </span>
              <span className="hidden text-[15px] font-bold leading-tight text-slate-900 sm:block">{appName}</span>
            </Link>
            <nav className="min-w-0 flex-1">
              <ul className="flex gap-0.5 overflow-x-auto">
                {sportTabs.map((s) => (
                  <li key={s.key} className="shrink-0">
                    <Link
                      href={s.href}
                      className="block border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-[#15607A] hover:text-[#15607A]"
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* ③ 기능 줄 */}
        <nav className="border-b border-slate-200 bg-white">
          <ul className="mx-auto flex max-w-7xl gap-0.5 overflow-x-auto px-4">
            {sections.map((s) => (
              <li key={s.key} className="shrink-0">
                <Link
                  href={s.href}
                  className="block border-b-2 border-transparent px-3 py-2 text-sm text-slate-600 transition-colors hover:border-[#15607A] hover:text-[#15607A]"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="mt-4 border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#15607A] text-[11px] font-bold text-white">VSP</span>
            <span className="text-sm font-medium text-slate-600">{appName}</span>
          </div>
          <ul className="flex flex-wrap gap-4 text-sm text-slate-500">
            {utilities.map((u) => (
              <li key={u.key}>
                <Link href={u.href} className="transition-colors hover:text-[#15607A]">
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
