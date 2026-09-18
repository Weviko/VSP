import { DEFAULT_LOCALE, type Locale } from './config';
import vi from './messages/vi.json';
import en from './messages/en.json';
import ko from './messages/ko.json';

const DICTS = { vi, en, ko } as const;
export type Messages = typeof vi;

/**
 * 화면 문구 조회. 'admin.org.title' 같은 점 표기 키를 쓴다.
 * 번역이 없으면 베트남어 → 키 자체 순으로 폴백한다(빈 화면 방지).
 */
export function getMessages(locale: Locale) {
  const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
  return function t(key: string, vars?: Record<string, string | number>): string {
    const pick = (d: unknown): string | undefined =>
      key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], d) as
        | string
        | undefined;
    let out = pick(dict) ?? pick(DICTS[DEFAULT_LOCALE]) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
    return out;
  };
}
