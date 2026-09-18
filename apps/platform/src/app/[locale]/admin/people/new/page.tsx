import Link from 'next/link';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Card } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { createPersonForm } from './actions';

export const dynamic = 'force-dynamic';

/**
 * 인물 신규 등록(단건). 엑셀 일괄 등록·조직 배치 외에 담당자가 한 명을 직접 추가하는 경로.
 * 신분증(CCCD)은 해시로만 저장된다.
 */
export default async function NewPersonPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/${locale}/admin/people`} className="text-sm text-sky-700 hover:underline">← {t('person.title')}</Link>
      </div>
      <PageHeader title={t('person.addMember')} />

      <Card>
        <form action={createPersonForm.bind(null, locale)} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.name')}</span>
            <input name="full_name" required className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.nameLatin')}</span>
            <input name="name_latin" className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.gender')}</span>
            <select name="gender" defaultValue="" className={input}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="X">X</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.birthDate')}</span>
            <input name="birth_date" type="date" className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('org.phone')}</span>
            <input name="phone" className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('person.email')}</span>
            <input name="email" type="email" className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">{t('person.address')}</span>
            <input name="address" className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">{t('person.idDoc')} (CCCD)</span>
            <input name="cccd" className={input} />
            <span className="mt-1 block text-xs text-slate-400">{t('person.cccdHint')}</span>
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
