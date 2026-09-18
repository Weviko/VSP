import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { isLocale, LOCALES } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';

// 베트남어 성조 표기를 정확히 렌더링하는 폰트 (vietnamese subset 포함)
const beVietnam = Be_Vietnam_Pro({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(isLocale(locale) ? locale : 'vi');
  return {
    title: { default: t('app.name'), template: `%s · ${t('app.shortName')}` },
    description: t('app.tagline'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} className={`${beVietnam.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
