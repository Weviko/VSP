/**
 * 팬 참여 — 투표(MVP 등) · 응원(좋아요) (문서 04).
 *
 * 재방문을 만드는 가벼운 참여. 투표·응원은 로그인한 본인(account)만 한다.
 * 공개 쪽에는 집계만 나간다(pub.poll / pub.cheer_count) — 누가 했는지는 공개하지 않는다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type PollStatus = 'DRAFT' | 'OPEN' | 'CLOSED';
export type CheerTarget = 'PERSON' | 'TEAM' | 'EVENT' | 'ARTICLE';

export interface PollRow {
  id: UUID;
  title_i18n: I18nText;
  poll_type: string;
  event_id: UUID | null;
  sport_id: UUID | null;
  opens_at: string | null;
  closes_at: string | null;
  status: string;
  created_at: string;
}

export interface PollOptionRow {
  id: UUID;
  poll_id: UUID;
  person_id: UUID | null;
  team_id: UUID | null;
  label_i18n: I18nText | null;
  sort_order: number;
  votes: number;
}

export async function listPolls(filter: { status?: PollStatus } = {}): Promise<PollRow[]> {
  return query<PollRow>(
    `SELECT id, title_i18n, poll_type, event_id, sport_id, opens_at::text, closes_at::text, status, created_at::text
       FROM content.poll
      WHERE ($1::text IS NULL OR status = $1)
      ORDER BY created_at DESC`,
    [filter.status ?? null]
  );
}

export async function getPoll(id: UUID): Promise<(PollRow & { options: PollOptionRow[] }) | null> {
  const poll = await queryOne<PollRow>(
    `SELECT id, title_i18n, poll_type, event_id, sport_id, opens_at::text, closes_at::text, status, created_at::text
       FROM content.poll WHERE id = $1`,
    [id]
  );
  if (!poll) return null;
  const options = await query<PollOptionRow>(
    `SELECT o.id, o.poll_id, o.person_id, o.team_id, o.label_i18n, o.sort_order,
            (SELECT count(*)::int FROM content.poll_vote v WHERE v.option_id = o.id) AS votes
       FROM content.poll_option o WHERE o.poll_id = $1 ORDER BY o.sort_order, o.id`,
    [id]
  );
  return { ...poll, options };
}

export async function createPoll(input: {
  titleI18n: I18nText; pollType?: string; eventId?: UUID | null; sportId?: UUID | null;
  opensAt?: string | null; closesAt?: string | null;
}, actorPersonId?: UUID | null): Promise<PollRow> {
  const rows = await query<PollRow>(
    `INSERT INTO content.poll (title_i18n, poll_type, event_id, sport_id, opens_at, closes_at, status)
     VALUES ($1::jsonb, $2, $3, $4, $5, $6, 'DRAFT')
     RETURNING id, title_i18n, poll_type, event_id, sport_id, opens_at::text, closes_at::text, status, created_at::text`,
    [JSON.stringify(input.titleI18n), input.pollType ?? 'MVP', input.eventId ?? null, input.sportId ?? null,
     input.opensAt ?? null, input.closesAt ?? null]
  );
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'poll', entityId: rows[0].id, action: 'POLL_CREATE' });
  return rows[0];
}

export async function addPollOption(pollId: UUID, input: {
  labelI18n?: I18nText | null; personId?: UUID | null; teamId?: UUID | null; sortOrder?: number;
}): Promise<PollOptionRow> {
  const rows = await query<PollOptionRow>(
    `INSERT INTO content.poll_option (poll_id, label_i18n, person_id, team_id, sort_order)
     VALUES ($1, $2::jsonb, $3, $4, $5)
     RETURNING id, poll_id, person_id, team_id, label_i18n, sort_order, 0 AS votes`,
    [pollId, input.labelI18n ? JSON.stringify(input.labelI18n) : null, input.personId ?? null, input.teamId ?? null, input.sortOrder ?? 0]
  );
  return rows[0];
}

/** 투표 선택지 삭제(잘못 넣은 항목 제거). 이미 들어온 표도 함께 지운다(개시 전 정리용). */
export async function deletePollOption(id: UUID, actorPersonId?: UUID | null): Promise<void> {
  await tx(async (client) => {
    await client.query(`DELETE FROM content.poll_vote WHERE option_id = $1`, [id]);
    await client.query(`DELETE FROM content.poll_option WHERE id = $1`, [id]);
  });
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'poll_option', entityId: id, action: 'DELETE' });
}

export async function setPollStatus(id: UUID, status: PollStatus, actorPersonId?: UUID | null): Promise<void> {
  await query(
    `UPDATE content.poll SET status = $2,
            opens_at = CASE WHEN $2='OPEN' AND opens_at IS NULL THEN now() ELSE opens_at END
      WHERE id = $1`,
    [id, status]
  );
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'poll', entityId: id, action: `POLL_${status}` });
}

/** 투표 (로그인 본인 1표, 다시 누르면 바꾼다). 열린 투표만. */
export async function castVote(pollId: UUID, optionId: UUID, accountId: UUID): Promise<void> {
  const poll = await queryOne<{ status: string }>(`SELECT status FROM content.poll WHERE id = $1`, [pollId]);
  if (poll?.status !== 'OPEN') throw new Error('POLL_NOT_OPEN');
  // 선택지가 이 투표의 것인지 확인 (교차 투표 차단)
  const opt = await queryOne<{ id: UUID }>(`SELECT id FROM content.poll_option WHERE id = $1 AND poll_id = $2`, [optionId, pollId]);
  if (!opt) throw new Error('BAD_OPTION');
  await query(
    `INSERT INTO content.poll_vote (poll_id, option_id, account_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (poll_id, account_id) WHERE account_id IS NOT NULL
     DO UPDATE SET option_id = EXCLUDED.option_id, voted_at = now()`,
    [pollId, optionId, accountId]
  );
}

/** 내가 이 투표에서 고른 선택지 (없으면 null). */
export async function myVote(pollId: UUID, accountId: UUID): Promise<UUID | null> {
  const r = await queryOne<{ option_id: UUID }>(
    `SELECT option_id FROM content.poll_vote WHERE poll_id = $1 AND account_id = $2`,
    [pollId, accountId]
  );
  return r?.option_id ?? null;
}

/** 응원 토글 — 한 번 누르면 응원, 다시 누르면 취소. 대상별 1인 1응원. */
export async function toggleCheer(targetType: CheerTarget, targetId: UUID, accountId: UUID): Promise<{ cheered: boolean; count: number }> {
  const existing = await queryOne<{ id: UUID }>(
    `SELECT id FROM content.cheer WHERE target_type = $1 AND target_id = $2 AND account_id = $3`,
    [targetType, targetId, accountId]
  );
  if (existing) {
    await query(`DELETE FROM content.cheer WHERE id = $1`, [existing.id]);
  } else {
    await query(
      `INSERT INTO content.cheer (target_type, target_id, account_id) VALUES ($1, $2, $3)`,
      [targetType, targetId, accountId]
    );
  }
  const c = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM content.cheer WHERE target_type = $1 AND target_id = $2`,
    [targetType, targetId]
  );
  return { cheered: !existing, count: c?.n ?? 0 };
}

export async function hasCheered(targetType: CheerTarget, targetId: UUID, accountId: UUID): Promise<boolean> {
  const r = await queryOne<{ id: UUID }>(
    `SELECT id FROM content.cheer WHERE target_type = $1 AND target_id = $2 AND account_id = $3`,
    [targetType, targetId, accountId]
  );
  return Boolean(r);
}
