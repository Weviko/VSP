import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { LocaleSwitch } from '@vsp/web-shared/LocaleSwitch';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { canUseWorkspace } from '@vsp/core-admin';
import { currentUser } from '@/lib/session';
import { signOut } from '../login/actions';

/**
 * 업무 셸 — 협회·성/시·체육회·문체부 담당자용.
 *
 * 협회 사무국 인원이 1~5명이고 스마트폰 사용 비중이 높으므로
 * 메뉴는 얕게, 글자는 크게, 클릭 수는 적게 유지한다. 업무 성격으로 묶어 스크롤을 줄인다.
 *
 * 한국의 '내 생애주기'(개인 이력)는 업무가 아니라 회원 서비스이므로 /my 로 옮겼다.
 *
 * 주의: 이 레이아웃의 리다이렉트는 편의일 뿐 보안 장치가 아니다.
 * 레이아웃은 화면 전환 때 다시 실행되지 않으므로, 권한 확인은 화면·액션마다 requireWorkspace 로 한다.
 */
const MENU_GROUPS = [
  {
    key: 'work',
    items: [
      { key: 'dashboard', path: '' },
      { key: 'ingest', path: '/ingest' },
      { key: 'approvals', path: '/approvals' },
    ],
  },
  {
    key: 'registry',
    items: [
      { key: 'organizations', path: '/organizations' },
      { key: 'people', path: '/people' },
      { key: 'registrations', path: '/registrations' },
      { key: 'seasons', path: '/seasons' },
      { key: 'import', path: '/import' },
      { key: 'certificates', path: '/certificates' },
    ],
  },
  {
    key: 'operation',
    items: [
      { key: 'events', path: '/events' },
      { key: 'payments', path: '/payments' },
      { key: 'grants', path: '/grants' },
      { key: 'sponsors', path: '/sponsorship' },
      { key: 'content', path: '/content' },
      { key: 'polls', path: '/polls' },
    ],
  },
  {
    key: 'admin',
    items: [
      { key: 'users', path: '/users' },
      { key: 'integrity', path: '/integrity' },
      { key: 'documents', path: '/documents' },
      { key: 'ads', path: '/ads' },
      { key: 'notifications', path: '/notifications' },
      { key: 'audit', path: '/audit' },
      { key: 'reports', path: '/reports' },
      { key: 'settings', path: '/settings' },
    ],
  },
] as const;

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const { user, dbError } = await currentUser();

  // DB가 아직 없을 때는 로그인으로 튕기지 않고 안내를 보여준다 (개발 편의)
  if (!user && !dbError) redirect(`/${locale}/login`);
  // 업무 역할이 없는 계정(선수·학부모 등)은 회원 서비스로 보낸다
  if (user && !canUseWorkspace(user)) redirect(`/${locale}/my`);
  const portalUrl = process.env.VSP_PORTAL_URL ?? 'http://localhost:3000';

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <Link href={`/${locale}`} className="text-lg font-bold text-slate-900">
              {t('app.shortName')}
            </Link>
            <span className="text-sm text-slate-500">{t('nav.work')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/${locale}/my`} className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline">
              {t('nav.my')}
            </Link>
            <a href={`${portalUrl}/${locale}`} className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline">
              {t('nav.toPortal')}
            </a>
            {user ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {user.fullName ?? user.phone}
                </span>
                <form action={signOut.bind(null, locale)}>
                  <button className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-100">
                    {t('auth.logout')}
                  </button>
                </form>
              </>
            ) : null}
            <LocaleSwitch current={locale} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white lg:w-56 lg:border-b-0 lg:border-r">
          <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
            {MENU_GROUPS.map((g, gi) => (
              <div
                key={g.key}
                className={
                  'flex shrink-0 gap-1 lg:flex-col ' +
                  (gi > 0 ? 'lg:mt-3 lg:border-t lg:border-slate-100 lg:pt-3' : '')
                }
              >
                {g.items.map((m) => (
                  <Link
                    key={m.key}
                    href={`/${locale}/admin${m.path}`}
                    className="shrink-0 rounded px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t(`nav.${m.key}`)}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 lg:p-6">
          {dbError ? (
            <div className="mb-6">
              <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
