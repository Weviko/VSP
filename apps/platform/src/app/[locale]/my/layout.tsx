import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canUseWorkspace } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { LocaleSwitch } from '@vsp/web-shared/LocaleSwitch';
import { currentUser } from '@/lib/session';
import { signOut } from '../login/actions';

/**
 * 회원 서비스 셸 — 선수·지도자·심판·학부모.
 *
 * 한국으로 치면 정부24·스포츠지원포털(g1)의 '내 생애주기', 노르웨이의 Min idrett 에 해당한다.
 * 업무 셸과 같은 앱·같은 로그인·같은 데이터를 쓰지만 메뉴와 권한이 다르다.
 *   - 보이는 것은 자기 기록뿐이다
 *   - 광고가 없다 (공식 신청 절차가 이뤄지는 곳이다)
 *
 * 권한 확인은 화면에서 requireMember 로 한다. 이 레이아웃의 리다이렉트는 편의다.
 */
export default async function MemberLayout({
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
  if (!user && !dbError) redirect(`/${locale}/login`);
  const portalUrl = process.env.VSP_PORTAL_URL ?? 'http://localhost:3000';

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <Link href={`/${locale}/my`} className="text-lg font-bold text-slate-900">
              {t('app.shortName')}
            </Link>
            <span className="text-sm text-slate-500">{t('nav.member')}</span>
          </div>
          <div className="flex items-center gap-3">
            {canUseWorkspace(user) ? (
              <Link href={`/${locale}/admin`} className="text-sm text-slate-600 hover:text-slate-900">
                {t('nav.work')}
              </Link>
            ) : null}
            <a
              href={`${portalUrl}/${locale}`}
              className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline"
            >
              {t('nav.toPortal')}
            </a>
            {user ? (
              <form action={signOut.bind(null, locale)}>
                <button className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-100">
                  {t('auth.logout')}
                </button>
              </form>
            ) : null}
            <LocaleSwitch current={locale} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
