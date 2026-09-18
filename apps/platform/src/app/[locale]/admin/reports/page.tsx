import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Placeholder } from '@vsp/web-shared/Placeholder';
import { requireWorkspace } from '@/lib/session';

/** 미구현 메뉴 — 무엇이 들어올 자리인지 보여준다. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const planned: Record<string, string[]> = {"vi": ["Báo cáo gửi cơ quan quản lý", "Kế hoạch năm và quyết toán", "Xuất Excel/PDF"], "en": ["Reports to the authority", "Annual plan and settlement", "Excel/PDF export"], "ko": ["정부 제출 보고서", "연간 사업계획·정산", "엑셀/PDF 내보내기"]};

  return <Placeholder title={t('nav.reports')} planned={planned[locale] ?? planned.vi} />;
}
