import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { listSports, t as pick } from '@vsp/public-data';
import { isLocale, LOCALES, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PublicShell } from '@/components/PublicShell';

// 베트남어 성조 표기를 정확히 렌더링하는 폰트 (vietnamese subset 포함)
const beVietnam = Be_Vietnam_Pro({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(isLocale(locale) ? locale : 'vi');
  return {
    title: { default: t('app.name'), template: `%s · ${t('app.shortName')}` },
    description: t('app.tagline'),
  };
}

/**
 * 대외 웹사이트 셸.
 *
 * 메뉴 구성은 네이버 스포츠형이다 — 사람들은 "무슨 종목"을 먼저 고르고, 그 안에서 일정·순위·선수를 본다.
 * 2026-09-14 네이버 스포츠 첫 화면에서 확인한 순서를 따른다: 종목 탭(홈 포함)이 1단, 기능 메뉴가 2단.
 * 기관 정보(소개·공시·공개정보)는 유틸리티 줄로 내린다. 법적으로 공개해야 하지만 방문 목적의 중심은 아니다.
 *
 * 로그인 버튼은 업무 플랫폼으로 보낸다. 이 앱에는 로그인이 없다.
 */
export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getMessages(locale);
  const base = `/${locale}`;

  // 종목 탭은 데이터에서 온다. 종목이 늘어도 메뉴 코드를 고치지 않는다.
  let sports: Array<{ code: string; label: string }> = [];
  try {
    sports = (await listSports()).map((s) => ({ code: s.code.toLowerCase(), label: pick(s.name_i18n, locale) }));
  } catch {
    // DB 가 없어도 사이트 틀은 떠야 한다
  }

  const platformUrl = process.env.VSP_PLATFORM_URL ?? 'http://localhost:3001';

  return (
    <html lang={locale} className={`${beVietnam.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <PublicShell
          locale={locale}
          appName={t('app.name')}
          appShort={t('app.shortName')}
          loginHref={`${platformUrl}/${locale}/login`}
          loginLabel={t('auth.login')}
          sections={[
            { key: 'scoreboard', href: `${base}/scoreboard`, label: t('score.title') },
            { key: 'events', href: `${base}/events`, label: t('nav.schedule') },
            { key: 'results', href: `${base}/results`, label: t('nav.results') },
            { key: 'rankings', href: `${base}/rankings`, label: t('nav.rankings') },
            { key: 'athletes', href: `${base}/athletes`, label: t('nav.athletes') },
            { key: 'nteam', href: `${base}/national-teams`, label: t('nteam.title') },
            { key: 'news', href: `${base}/news`, label: t('nav.news') },
            { key: 'clubs', href: `${base}/clubs`, label: t('club.title') },
            { key: 'sponsors', href: `${base}/sponsorship`, label: t('nav.sponsors') },
          ]}
          sportTabs={[
            // 종목이 40여 개라 탭 줄에는 상위(정렬순)만 노출하고 나머지는 "전체 종목"으로.
            // 네이버도 탭엔 10개 안팎만 둔다. 노출 개수는 표시 규칙이라 이 숫자만 바꾸면 된다.
            { key: 'home', href: base, label: t('nav.home') },
            ...sports.slice(0, 10).map((s) => ({ key: s.code, href: `${base}/${s.code}`, label: s.label })),
            { key: 'all', href: `${base}/sports`, label: t('nav.allSports') },
          ]}
          utilities={[
            { key: 'about', href: `${base}/about`, label: t('nav.about') },
            { key: 'orgs', href: `${base}/orgs`, label: t('nav.orgs') },
            { key: 'disclosure', href: `${base}/orgs/disclosure`, label: t('nav.disclosure') },
            { key: 'openinfo', href: `${base}/info`, label: t('nav.openinfo') },
            { key: 'verify', href: `${base}/verify`, label: t('nav.verify') },
            { key: 'integrity', href: `${base}/integrity`, label: t('nav.integrity') },
            { key: 'antidoping', href: `${base}/antidoping`, label: t('nav.antidoping') },
          ]}
        >
          {children}
        </PublicShell>
      </body>
    </html>
  );
}
