'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createAdSlot, setSlotActive, createPlacement, updatePlacement, setPlacementStatus, deletePlacement, type UUID,
} from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/** 광고 게재 수정. */
export async function updatePlacementForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('placement_id') ?? '').trim();
  if (id) {
    const pct = String(formData.get('revenue_share_pct') ?? '').trim();
    await updatePlacement(id as UUID, {
      sponsorName: String(formData.get('sponsor_name') ?? '').trim() || undefined,
      imageUrl: String(formData.get('image_url') ?? '').trim() || null,
      linkUrl: String(formData.get('link_url') ?? '').trim() || null,
      revenueSharePct: pct ? Number(pct) : null,
      startsOn: String(formData.get('starts_on') ?? '').trim() || null,
      endsOn: String(formData.get('ends_on') ?? '').trim() || null,
    }, user.personId);
  }
  revalidatePath(`/${locale}/admin/ads`);
  redirect(`/${locale}/admin/ads`);
}

/** 광고 지면 관리 액션. 모두 requireWorkspace. */

export async function createSlotForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  const name = String(formData.get('name') ?? '').trim();
  if (code && name) await createAdSlot({ code, nameI18n: { [locale]: name } }, user.personId);
  revalidatePath(`/${locale}/admin/ads`);
  redirect(`/${locale}/admin/ads`);
}

export async function setSlotActiveForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('slot_id') ?? '') as UUID;
  const active = String(formData.get('active') ?? '') === 'true';
  if (id) await setSlotActive(id, active, user.personId);
  revalidatePath(`/${locale}/admin/ads`);
  redirect(`/${locale}/admin/ads`);
}

export async function createPlacementForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const slotId = String(formData.get('slot_id') ?? '') as UUID;
  const sponsorName = String(formData.get('sponsor_name') ?? '').trim();
  const pctRaw = String(formData.get('revenue_share_pct') ?? '').trim();
  if (slotId && sponsorName) {
    await createPlacement(
      {
        slotId,
        sponsorName,
        imageUrl: String(formData.get('image_url') ?? '').trim() || null,
        linkUrl: String(formData.get('link_url') ?? '').trim() || null,
        endsOn: String(formData.get('ends_on') ?? '').trim() || null,
        revenueSharePct: pctRaw ? Number(pctRaw) : null,
      },
      user.personId
    );
  }
  revalidatePath(`/${locale}/admin/ads`);
  redirect(`/${locale}/admin/ads`);
}

export async function setPlacementStatusForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('placement_id') ?? '') as UUID;
  const status = String(formData.get('status') ?? '');
  if (id && ['DRAFT', 'ACTIVE', 'ENDED'].includes(status)) {
    await setPlacementStatus(id, status as 'DRAFT' | 'ACTIVE' | 'ENDED', user.personId);
  }
  revalidatePath(`/${locale}/admin/ads`);
  redirect(`/${locale}/admin/ads`);
}

export async function deletePlacementForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('placement_id') ?? '') as UUID;
  if (id) await deletePlacement(id, user.personId);
  revalidatePath(`/${locale}/admin/ads`);
  redirect(`/${locale}/admin/ads`);
}
