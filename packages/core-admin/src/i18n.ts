/**
 * 다국어 처리.
 * 조직명·종목명 등 데이터 자체의 다국어는 DB에 JSONB로 저장하고 여기서 꺼낸다.
 * (화면 문구는 별도 리소스 파일 — apps/web/src/i18n/messages)
 */
export const LOCALES = ['vi', 'en', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export type I18nText = Partial<Record<Locale, string>> & Record<string, string | undefined>;

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/**
 * JSONB 다국어 값에서 표시 문자열을 고른다.
 * 요청 언어 → 베트남어 → 영어 → 아무거나 순으로 폴백한다.
 * 폴백을 두는 이유: 협회가 베트남어만 입력하는 경우가 대부분이기 때문.
 */
export function t(value: I18nText | string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return (
    value[locale] ??
    value.vi ??
    value.en ??
    Object.values(value).find((v): v is string => typeof v === 'string' && v.length > 0) ??
    ''
  );
}

/** 입력 폼에서 다국어 객체를 만들 때 사용 */
export function makeI18n(vi: string, en?: string, ko?: string): I18nText {
  const out: I18nText = { vi };
  if (en) out.en = en;
  if (ko) out.ko = ko;
  return out;
}

/**
 * 베트남어 성조를 제거한 검색용 문자열.
 * 국제대회 로마자 표기와 검색 인덱스에 쓴다. (예: "Nguyễn Văn A" -> "nguyen van a")
 */
export function toLatinSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
