export const LOCALES = ['vi', 'en', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export const LOCALE_LABELS: Record<Locale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ko: '한국어',
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}
