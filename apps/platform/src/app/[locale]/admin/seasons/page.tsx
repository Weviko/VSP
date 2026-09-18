import { listSeasons, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, Badge, Table, Tr, Td, EmptyState } from '@vsp/web-shared/ui';
import { requireWorkspace } from '@/lib/session';
import { createSeasonForm, setCurrentSeasonForm, updateSeasonForm } from './actions';

export const dynamic = 'force-dynamic';

/**
 * 시즌(회기) 관리 — 등록·대회의 연간 갱신 단위.
 * 새 회기를 만들고, 개시 시점에 "현재 시즌"으로 전환한다(범위마다 현재는 하나).
 */
export default async function SeasonsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);

  let rows = null;
  let error: string | undefined;
  try {
    rows = await listSeasons();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const input = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader title={t('season.title')} subtitle={t('season.subtitle')} />

      {/* 새 회기 */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('season.create')}</h2>
        <form action={createSeasonForm.bind(null, locale)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('season.code')}</span>
            <input name="code" required placeholder="2027" className={input} />
          </label>
          <label className="block text-sm lg:col-span-2">
            <span className="mb-1 block text-slate-600">{t('season.name')} (VI)</span>
            <input name="name_vi" required placeholder="Mùa giải 2027" className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('season.name')} (EN)</span>
            <input name="name_en" placeholder="Season 2027" className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('season.name')} (KO)</span>
            <input name="name_ko" placeholder="2027 시즌" className={input} />
          </label>
          <div className="hidden lg:block" />
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('season.starts')}</span>
            <input name="starts_on" type="date" required className={input} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t('season.ends')}</span>
            <input name="ends_on" type="date" required className={input} />
          </label>
          <div className="flex items-end">
            <button className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('season.create')}</button>
          </div>
        </form>
      </Card>

      {!rows ? (
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={error} />
      ) : rows.length === 0 ? (
        <EmptyState message={t('season.empty')} />
      ) : (
        <Table head={[t('season.code'), t('season.name'), t('season.starts'), t('season.ends'), t('season.scope'), '']}>
          {rows.map((s) => (
            <Tr key={s.id}>
              <Td className="font-mono text-slate-700">
                {s.code}
                {s.is_current ? <span className="ml-2 inline-block"><Badge tone="green">{t('season.current')}</Badge></span> : null}
              </Td>
              <Td className="font-medium text-slate-900 wrap-anywhere">{pick(s.name_i18n, locale)}</Td>
              <Td className="tabular-nums text-slate-600">{s.starts_on}</Td>
              <Td className="tabular-nums text-slate-600">{s.ends_on}</Td>
              <Td className="text-slate-500">{s.scope_type}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  {s.is_current ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <form action={setCurrentSeasonForm.bind(null, locale, s.id)}>
                      <button className="rounded border border-emerald-300 px-3 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50">{t('season.setCurrent')}</button>
                    </form>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-sky-700">{t('common.edit')}</summary>
                    <form action={updateSeasonForm.bind(null, locale, s.id)} className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input name="code" defaultValue={s.code} required placeholder={t('season.code')} className={input} />
                      <input name="name_vi" defaultValue={(s.name_i18n as Record<string, string>).vi ?? ''} required placeholder={`${t('season.name')} VI`} className={input} />
                      <input name="name_en" defaultValue={(s.name_i18n as Record<string, string>).en ?? ''} placeholder={`${t('season.name')} EN`} className={input} />
                      <input name="name_ko" defaultValue={(s.name_i18n as Record<string, string>).ko ?? ''} placeholder={`${t('season.name')} KO`} className={input} />
                      <input name="starts_on" type="date" defaultValue={s.starts_on} className={input} />
                      <input name="ends_on" type="date" defaultValue={s.ends_on} className={input} />
                      <div className="sm:col-span-2">
                        <button className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
                      </div>
                    </form>
                  </details>
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}
