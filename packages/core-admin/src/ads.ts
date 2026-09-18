/**
 * 광고 지면 — 지면(slot) · 게재(placement) 관리 (문서 04).
 *
 * 광고 수익은 해당 종목 협회에 배분한다(revenue_share) — 체육회 설득의 핵심 논리라 내부에 명시한다.
 * 지면은 기본 비활성이고, 협회 합의로 켠다. 공개 노출은 pub.ad(활성·게재중·기간 내)가 강제한다.
 */
import { query, queryOne } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export interface AdSlotRow {
  id: UUID;
  code: string;
  name_i18n: I18nText;
  placement: string | null;
  width: number | null;
  height: number | null;
  is_active: boolean;
}

export interface AdPlacementRow {
  id: UUID;
  slot_id: UUID;
  sponsor_org_id: UUID | null;
  sponsor_name: string | null;
  image_url: string | null;
  link_url: string | null;
  revenue_share_org_id: UUID | null;
  revenue_share_pct: string | null;
  starts_on: string | null;
  ends_on: string | null;
  impressions: number;
  clicks: number;
  status: string;
}

export async function listAdSlots(): Promise<AdSlotRow[]> {
  return query<AdSlotRow>(
    `SELECT id, code, name_i18n, placement, width, height, is_active FROM content.ad_slot ORDER BY code`
  );
}

export async function createAdSlot(input: {
  code: string; nameI18n: I18nText; placement?: string | null; width?: number | null; height?: number | null;
}, actorPersonId?: UUID | null): Promise<AdSlotRow> {
  const rows = await query<AdSlotRow>(
    `INSERT INTO content.ad_slot (code, name_i18n, placement, width, height, is_active)
     VALUES ($1, $2::jsonb, $3, $4, $5, false)
     RETURNING id, code, name_i18n, placement, width, height, is_active`,
    [input.code, JSON.stringify(input.nameI18n), input.placement ?? null, input.width ?? null, input.height ?? null]
  );
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'ad_slot', entityId: rows[0].id, action: 'AD_SLOT_CREATE' });
  return rows[0];
}

export async function setSlotActive(id: UUID, active: boolean, actorPersonId?: UUID | null): Promise<void> {
  await query(`UPDATE content.ad_slot SET is_active = $2 WHERE id = $1`, [id, active]);
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'ad_slot', entityId: id, action: active ? 'AD_SLOT_ON' : 'AD_SLOT_OFF' });
}

export async function listPlacements(slotId?: UUID): Promise<AdPlacementRow[]> {
  return query<AdPlacementRow>(
    `SELECT id, slot_id, sponsor_org_id, sponsor_name, image_url, link_url,
            revenue_share_org_id, revenue_share_pct, starts_on::text, ends_on::text,
            impressions, clicks, status
       FROM content.ad_placement
      WHERE ($1::uuid IS NULL OR slot_id = $1)
      ORDER BY status, ends_on DESC NULLS LAST`,
    [slotId ?? null]
  );
}

export async function createPlacement(input: {
  slotId: UUID; sponsorName: string; imageUrl?: string | null; linkUrl?: string | null;
  sponsorOrgId?: UUID | null; revenueShareOrgId?: UUID | null; revenueSharePct?: number | null;
  startsOn?: string | null; endsOn?: string | null;
}, actorPersonId?: UUID | null): Promise<AdPlacementRow> {
  const rows = await query<AdPlacementRow>(
    `INSERT INTO content.ad_placement
       (slot_id, sponsor_name, image_url, link_url, sponsor_org_id, revenue_share_org_id, revenue_share_pct, starts_on, ends_on, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT')
     RETURNING id, slot_id, sponsor_org_id, sponsor_name, image_url, link_url,
               revenue_share_org_id, revenue_share_pct, starts_on::text, ends_on::text, impressions, clicks, status`,
    [
      input.slotId, input.sponsorName, input.imageUrl ?? null, input.linkUrl ?? null,
      input.sponsorOrgId ?? null, input.revenueShareOrgId ?? null, input.revenueSharePct ?? null,
      input.startsOn ?? null, input.endsOn ?? null,
    ]
  );
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'ad_placement', entityId: rows[0].id, action: 'AD_PLACEMENT_CREATE' });
  return rows[0];
}

/** 광고 게재 수정(문안·이미지·링크·기간·수익배분). 상태 변경은 setPlacementStatus 가 따로 한다. */
export async function updatePlacement(id: UUID, input: {
  sponsorName?: string; imageUrl?: string | null; linkUrl?: string | null;
  revenueSharePct?: number | null; startsOn?: string | null; endsOn?: string | null;
}, actorPersonId?: UUID | null): Promise<void> {
  await query(
    `UPDATE content.ad_placement
        SET sponsor_name = COALESCE($2, sponsor_name),
            image_url = $3, link_url = $4, revenue_share_pct = $5,
            starts_on = $6, ends_on = $7
      WHERE id = $1`,
    [id, input.sponsorName ?? null, input.imageUrl ?? null, input.linkUrl ?? null,
     input.revenueSharePct ?? null, input.startsOn ?? null, input.endsOn ?? null]
  );
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'ad_placement', entityId: id, action: 'AD_PLACEMENT_UPDATE' });
}

export async function setPlacementStatus(id: UUID, status: 'DRAFT' | 'ACTIVE' | 'ENDED', actorPersonId?: UUID | null): Promise<void> {
  await query(`UPDATE content.ad_placement SET status = $2 WHERE id = $1`, [id, status]);
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'ad_placement', entityId: id, action: `AD_PLACEMENT_${status}` });
}

export async function deletePlacement(id: UUID, actorPersonId?: UUID | null): Promise<void> {
  await query(`DELETE FROM content.ad_placement WHERE id = $1`, [id]);
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'ad_placement', entityId: id, action: 'AD_PLACEMENT_DELETE' });
}
