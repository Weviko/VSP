import { redirect } from 'next/navigation';
import { canUseWorkspace } from '@vsp/core-admin';
import { isLocale } from '@vsp/web-shared/i18n/config';
import { currentUser } from '@/lib/session';

/**
 * 업무 플랫폼 입구.
 * 이 앱에는 공개 화면이 없다 — 공개 정보는 대외 웹사이트(apps/portal)에 있다.
 * 역할에 따라 업무 화면이나 회원 서비스로 보낸다.
 */
export const dynamic = 'force-dynamic';

export default async function PlatformEntry({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : 'vi';
  const { user } = await currentUser();
  if (!user) redirect(`/${locale}/login`);
  redirect(canUseWorkspace(user) ? `/${locale}/admin` : `/${locale}/my`);
}
