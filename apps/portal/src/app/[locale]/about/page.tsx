import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Placeholder } from '@vsp/web-shared/Placeholder';

/** 미구현 메뉴 — 무엇이 들어올 자리인지 보여준다. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const planned: Record<string, string[]> = {"vi": ["Giới thiệu, lịch sử, tổ chức", "Lãnh đạo và các ban", "Thể thao trong sạch: nhân quyền, liêm chính, tố giác", "Nhà tài trợ, liên hệ"], "en": ["Introduction, history, organization", "Leadership and committees", "Sport integrity: human rights, anti-corruption, whistleblowing", "Sponsors, contact"], "ko": ["소개·연혁·조직", "임원 및 위원회", "공정체육: 인권·청렴·신고센터", "후원사·연락처"]};

  return <Placeholder title={t('nav.about')} planned={planned[locale] ?? planned.vi} />;
}
