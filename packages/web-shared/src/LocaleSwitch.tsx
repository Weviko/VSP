'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from './i18n/config';

export function LocaleSwitch({ current }: { current: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  function change(next: string) {
    const rest = pathname.replace(new RegExp(`^/(${LOCALES.join('|')})`), '');
    router.push(`/${next}${rest || ''}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => change(e.target.value)}
      aria-label="Language"
      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
