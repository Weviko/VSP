import { listAdSlots, listPlacements, t as pick, type UUID } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { DbNotice } from '@vsp/web-shared/DbNotice';
import { PageHeader, Card, EmptyState, Badge, statusTone } from '@vsp/web-shared/ui';
import { requireWorkspace, currentUser } from '@/lib/session';
import {
  createSlotForm, setSlotActiveForm, createPlacementForm, updatePlacementForm, setPlacementStatusForm, deletePlacementForm,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * 광고 지면 관리. 지면은 기본 비활성 — 협회 합의로 켠다.
 * 광고 수익의 종목 협회 배분(revenue_share)은 내부에만 표시한다(공개 뷰엔 없음).
 */
export default async function AdsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  await requireWorkspace(locale);
  const t = getMessages(locale);
  const { dbError } = await currentUser();

  if (dbError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">{t('nav.ads')}</h1>
        <DbNotice title={t('db.notReady')} hint={t('db.notReadyHint')} error={dbError} />
      </div>
    );
  }

  const slots = await listAdSlots();
  const placements = await listPlacements();
  const byslot = (id: UUID) => placements.filter((p) => p.slot_id === id);

  return (
    <div className="space-y-8">
      <PageHeader title={t('nav.ads')} subtitle={t('ad.subtitle')} />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('ad.newSlot')}</h2>
        <form action={createSlotForm.bind(null, locale)} className="flex flex-wrap items-end gap-2">
          <input name="code" required placeholder="HOME_TOP" className="w-40 rounded border border-slate-300 px-3 py-2 text-sm font-mono uppercase" />
          <input name="name" required placeholder={t('ad.slotName')} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">{t('common.add')}</button>
        </form>
      </Card>

      {slots.length === 0 ? (
        <EmptyState message={t('ad.noSlots')} />
      ) : (
        <ul className="space-y-4">
          {slots.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{pick(s.name_i18n, locale)} <span className="ml-1 font-mono text-xs text-slate-400">{s.code}</span></span>
                <div className="flex items-center gap-2">
                  <Badge tone={s.is_active ? 'green' : 'neutral'}>{t(s.is_active ? 'ad.active' : 'ad.inactive')}</Badge>
                  <form action={setSlotActiveForm.bind(null, locale)}>
                    <input type="hidden" name="slot_id" value={s.id} />
                    <input type="hidden" name="active" value={s.is_active ? 'false' : 'true'} />
                    <button className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">{t(s.is_active ? 'ad.turnOff' : 'ad.turnOn')}</button>
                  </form>
                </div>
              </div>

              <ul className="mt-3 space-y-1.5">
                {byslot(s.id).length === 0 ? (
                  <li className="text-sm text-slate-400">{t('ad.noPlacements')}</li>
                ) : byslot(s.id).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={statusTone(p.status)}>{t(`status.${p.status}`)}</Badge>
                    <span className="font-medium text-slate-800">{p.sponsor_name}</span>
                    {p.revenue_share_pct ? <span className="text-xs text-slate-500">{t('ad.revShare')} {p.revenue_share_pct}%</span> : null}
                    {p.ends_on ? <span className="text-xs text-slate-400">~{p.ends_on}</span> : null}
                    <span className="ml-auto flex items-center gap-2">
                      {p.status !== 'ACTIVE' ? (
                        <form action={setPlacementStatusForm.bind(null, locale)}><input type="hidden" name="placement_id" value={p.id} /><input type="hidden" name="status" value="ACTIVE" /><button className="text-xs text-emerald-700 hover:underline">{t('ad.run')}</button></form>
                      ) : (
                        <form action={setPlacementStatusForm.bind(null, locale)}><input type="hidden" name="placement_id" value={p.id} /><input type="hidden" name="status" value="ENDED" /><button className="text-xs text-amber-700 hover:underline">{t('ad.end')}</button></form>
                      )}
                      <form action={deletePlacementForm.bind(null, locale)}><input type="hidden" name="placement_id" value={p.id} /><button className="text-xs text-slate-400 hover:text-red-600">{t('common.delete')}</button></form>
                    </span>
                    <details className="w-full">
                      <summary className="cursor-pointer text-xs text-sky-700">{t('common.edit')}</summary>
                      <form action={updatePlacementForm.bind(null, locale)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_6rem_8rem_8rem]">
                        <input type="hidden" name="placement_id" value={p.id} />
                        <input name="sponsor_name" defaultValue={p.sponsor_name ?? ''} placeholder={t('ad.sponsor')} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                        <input name="link_url" defaultValue={p.link_url ?? ''} placeholder="https://…" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                        <input name="revenue_share_pct" type="number" min="0" max="100" defaultValue={p.revenue_share_pct ?? ''} placeholder="%" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                        <input name="starts_on" type="date" defaultValue={p.starts_on ?? ''} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                        <input name="ends_on" type="date" defaultValue={p.ends_on ?? ''} className="rounded border border-slate-300 px-2 py-1 text-sm" />
                        <input name="image_url" defaultValue={p.image_url ?? ''} placeholder={t('ad.imageUrl')} className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-4" />
                        <button className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700">{t('common.save')}</button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>

              <form action={createPlacementForm.bind(null, locale)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_6rem_8rem_auto] sm:items-center">
                <input type="hidden" name="slot_id" value={s.id} />
                <input name="sponsor_name" required placeholder={t('ad.sponsor')} className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="link_url" placeholder="https://…" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="revenue_share_pct" type="number" min="0" max="100" placeholder="%" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="ends_on" type="date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="image_url" placeholder={t('ad.imageUrl')} className="rounded border border-slate-300 px-2 py-1.5 text-sm sm:col-span-4" />
                <button className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">{t('common.add')}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
