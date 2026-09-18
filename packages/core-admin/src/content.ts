/**
 * 경기 콘텐츠 작성 — 문자중계 · 영상 (문서 14 §5-B).
 *
 * 협회 담당자가 경기에 중계 한 줄씩, 영상 링크를 붙인다. 공개 노출 규칙(승인된 경기만 등)은
 * pub 뷰(013)가 강제하므로 여기서는 작성·삭제만 한다. 모든 변경은 감사기록을 남긴다.
 */
import { query, queryOne } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

// ── 문자중계 ────────────────────────────────────────────────────────────────

export interface RelayRow {
  id: UUID;
  match_id: UUID;
  seq: number;
  clock: string | null;
  side: string | null;
  kind: string;
  text_i18n: I18nText;
  created_at: string;
}

export interface RelayInput {
  clock?: string | null;
  side?: string | null;
  kind?: string;
  textI18n: I18nText;
}

/** 한 경기의 중계 전체 (작성 순서대로). */
export async function listRelay(matchId: UUID): Promise<RelayRow[]> {
  return query<RelayRow>(
    `SELECT id, match_id, seq, clock, side, kind, text_i18n, created_at::text
       FROM content.match_relay WHERE match_id = $1 ORDER BY seq`,
    [matchId]
  );
}

/** 중계 한 줄 추가. seq 는 자동으로 다음 번호. */
export async function addRelay(matchId: UUID, input: RelayInput, actorPersonId?: UUID | null): Promise<RelayRow> {
  const next = await queryOne<{ seq: number }>(
    `SELECT COALESCE(max(seq), 0) + 1 AS seq FROM content.match_relay WHERE match_id = $1`,
    [matchId]
  );
  const rows = await query<RelayRow>(
    `INSERT INTO content.match_relay (match_id, seq, clock, side, kind, text_i18n)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, match_id, seq, clock, side, kind, text_i18n, created_at::text`,
    [matchId, next?.seq ?? 1, input.clock ?? null, input.side ?? null, input.kind ?? 'INFO', JSON.stringify(input.textI18n)]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'match_relay',
    entityId: rows[0].id, action: 'RELAY_ADD', after: { match: matchId, seq: rows[0].seq },
  });
  return rows[0];
}

/** 중계 한 줄 삭제. */
export async function deleteRelay(id: UUID, actorPersonId?: UUID | null): Promise<void> {
  await query(`DELETE FROM content.match_relay WHERE id = $1`, [id]);
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'match_relay',
    entityId: id, action: 'RELAY_DELETE',
  });
}

// ── 영상 ────────────────────────────────────────────────────────────────────

export interface VideoRow {
  id: UUID;
  match_id: UUID | null;
  event_id: UUID | null;
  sport_id: UUID | null;
  title_i18n: I18nText;
  provider: string;
  external_id: string | null;
  url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
  status: string;
  published_at: string | null;
}

export interface VideoInput {
  matchId?: UUID | null;
  eventId?: UUID | null;
  sportId?: UUID | null;
  titleI18n: I18nText;
  provider?: string;                 // YOUTUBE / FILE / URL
  externalId?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  sortOrder?: number;
  status?: string;                   // DRAFT / PUBLISHED / HIDDEN
}

/** 경기·대회의 영상 목록 (관리용 — 모든 상태 포함, 삭제된 것 제외). */
export async function listVideos(filter: { matchId?: UUID; eventId?: UUID }): Promise<VideoRow[]> {
  return query<VideoRow>(
    `SELECT id, match_id, event_id, sport_id, title_i18n, provider, external_id, url,
            thumbnail_url, duration_seconds, sort_order, status, published_at::text
       FROM content.video
      WHERE deleted_at IS NULL
        AND ($1::uuid IS NULL OR match_id = $1)
        AND ($2::uuid IS NULL OR event_id = $2)
      ORDER BY sort_order, published_at DESC NULLS LAST`,
    [filter.matchId ?? null, filter.eventId ?? null]
  );
}

/** 영상 추가. 기본 게시(PUBLISHED) — 공개 노출은 pub.video 가 경기/대회 공개 여부로 다시 거른다. */
export async function addVideo(input: VideoInput, actorPersonId?: UUID | null): Promise<VideoRow> {
  const rows = await query<VideoRow>(
    `INSERT INTO content.video
       (match_id, event_id, sport_id, title_i18n, provider, external_id, url, thumbnail_url,
        duration_seconds, sort_order, status)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, match_id, event_id, sport_id, title_i18n, provider, external_id, url,
               thumbnail_url, duration_seconds, sort_order, status, published_at::text`,
    [
      input.matchId ?? null, input.eventId ?? null, input.sportId ?? null,
      JSON.stringify(input.titleI18n), input.provider ?? 'YOUTUBE',
      input.externalId ?? null, input.url ?? null, input.thumbnailUrl ?? null,
      input.durationSeconds ?? null, input.sortOrder ?? 0, input.status ?? 'PUBLISHED',
    ]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'video',
    entityId: rows[0].id, action: 'VIDEO_ADD', after: { match: input.matchId, event: input.eventId },
  });
  return rows[0];
}

/** 영상 게시 상태 변경 (DRAFT/PUBLISHED/HIDDEN). */
export async function setVideoStatus(id: UUID, status: string, actorPersonId?: UUID | null): Promise<void> {
  await query(
    `UPDATE content.video SET status = $2,
            published_at = CASE WHEN $2 = 'PUBLISHED' AND published_at IS NULL THEN now() ELSE published_at END
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, status]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'video',
    entityId: id, action: 'VIDEO_STATUS', after: { status },
  });
}

/** 영상 삭제 (소프트 — 증빙·감사 위해 행은 남긴다). */
export async function deleteVideo(id: UUID, actorPersonId?: UUID | null): Promise<void> {
  await query(`UPDATE content.video SET deleted_at = now() WHERE id = $1`, [id]);
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'video',
    entityId: id, action: 'VIDEO_DELETE',
  });
}
