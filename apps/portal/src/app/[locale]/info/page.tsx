import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Placeholder } from '@vsp/web-shared/Placeholder';

/** 미구현 메뉴 — 무엇이 들어올 자리인지 보여준다. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const planned: Record<string, string[]> = {"vi": ["Thông báo", "Thống kê", "Văn bản pháp luật", "Yêu cầu cung cấp thông tin"], "en": ["Notices", "Statistics", "Legal documents", "Information requests"], "ko": ["공지사항", "통계 현황판", "법령·규정", "정보공개청구"]};

  return <Placeholder title={t('nav.openinfo')} planned={planned[locale] ?? planned.vi} />;
}
