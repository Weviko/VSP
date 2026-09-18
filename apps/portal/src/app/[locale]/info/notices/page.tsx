import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Placeholder } from '@vsp/web-shared/Placeholder';

/** 미구현 메뉴 — 무엇이 들어올 자리인지 보여준다. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const planned: Record<string, string[]> = {"vi": ["Thông báo, đấu thầu, tuyển dụng", "Văn bản pháp luật và điều lệ", "Kho tài liệu"], "en": ["Notices, tenders, recruitment", "Laws and regulations", "Document archive"], "ko": ["공지·입찰·채용", "법령 및 정관·규정", "자료실"]};

  return <Placeholder title={t('nav.notices')} planned={planned[locale] ?? planned.vi} />;
}
