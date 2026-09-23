/**
 * 경기 운영 심화 — 심판 배정 + 현장 실시간 기록.
 *
 * 기존 sport.match/match_participant 위에 심판 배정(자격 근거·시간충돌 검증)과
 * 실시간 이벤트 로그(득점·반칙·교체·피리어드) + 러닝스코어(live_state)를 얹는다.
 * 세션 종료(finalize) 시 러닝스코어를 참가자 점수로 확정한다.
 */
import { query, queryOne, tx, writeAudit, type UUID, type I18nText } from '@vsp/core-admin';

export type OfficialRole = 'CHIEF_REFEREE' | 'REFEREE' | 'JUDGE' | 'SCORER' | 'TIMEKEEPER' | 'COMMISSIONER';
export type OfficialStatus = 'ASSIGNED' | 'CONFIRMED' | 'DECLINED' | 'REPLACED';
export type MatchEventKind = 'SCORE' | 'FOUL' | 'SUB' | 'PERIOD_START' | 'PERIOD_END' | 'TIMEOUT' | 'CARD' | 'NOTE';

type Actor = { personId?: UUID | null; orgId?: UUID | null };

// ── 심판 배정 ─────────────────────────────────────────────────────────────

export interface MatchOfficialRow {
  id: UUID; person_id: UUID; full_name: string; role: OfficialRole; status: OfficialStatus; note: string | null;
}
export async function listMatchOfficials(matchId: UUID): Promise<MatchOfficialRow[]> {
  return query<MatchOfficialRow>(
    `SELECT mo.id, mo.person_id, p.full_name, mo.role, mo.status, mo.note
       FROM sport.match_official mo JOIN core.person p ON p.id = mo.person_id
      WHERE mo.match_id = $1
      ORDER BY CASE mo.role WHEN 'CHIEF_REFEREE' THEN 0 WHEN 'REFEREE' THEN 1 ELSE 2 END, p.full_name`,
    [matchId]
  );
}

export interface RefereeCandidate { person_id: UUID; full_name: string; registration_id: UUID; license_grade: string | null; }
export async function listRefereeCandidates(sportId?: UUID | null): Promise<RefereeCandidate[]> {
  return query<RefereeCandidate>(
    `SELECT DISTINCT r.person_id, p.full_name, r.id AS registration_id, r.license_grade
       FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.reg_type='REFEREE' AND r.status='APPROVED'
        AND ($1::uuid IS NULL OR r.sport_id = $1)
      ORDER BY p.full_name`,
    [sportId ?? null]
  );
}

/** 같은 시간대(±2시간)에 이미 배정된 다른 경기(시간충돌). */
export async function findOfficialConflicts(personId: UUID, matchId: UUID): Promise<Array<{ match_id: UUID; match_no: string | null; scheduled_at: string | null }>> {
  return query(
    `SELECT m2.id AS match_id, m2.match_no, m2.scheduled_at::text AS scheduled_at
       FROM sport.match_official mo
       JOIN sport.match m2 ON m2.id = mo.match_id
       JOIN sport.match m1 ON m1.id = $2
      WHERE mo.person_id = $1 AND mo.match_id <> $2 AND mo.status IN ('ASSIGNED','CONFIRMED')
        AND m1.scheduled_at IS NOT NULL AND m2.scheduled_at IS NOT NULL
        AND abs(EXTRACT(EPOCH FROM (m2.scheduled_at - m1.scheduled_at))) < 7200`,
    [personId, matchId]
  );
}

const ROLES: OfficialRole[] = ['CHIEF_REFEREE', 'REFEREE', 'JUDGE', 'SCORER', 'TIMEKEEPER', 'COMMISSIONER'];
export interface AssignOfficialInput { matchId: UUID; personId: UUID; role?: OfficialRole; registrationId?: UUID | null; }
export async function assignMatchOfficial(input: AssignOfficialInput, actor: Actor = {}): Promise<UUID | null> {
  const role = input.role && ROLES.includes(input.role) ? input.role : 'REFEREE';
  return tx(async (client) => {
    const res = await client.query<{ id: UUID }>(
      `INSERT INTO sport.match_official (match_id, person_id, registration_id, role)
       VALUES ($1,$2,$3,$4) ON CONFLICT (match_id, person_id, role) DO NOTHING RETURNING id`,
      [input.matchId, input.personId, input.registrationId ?? null, role]
    );
    const id = res.rows[0]?.id ?? null;
    if (id) await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'match_official', entityId: id, action: 'ASSIGN_OFFICIAL',
        after: { match: input.matchId, person: input.personId, role } }, client
    );
    return id;
  });
}
const OFFICIAL_STATUSES: OfficialStatus[] = ['ASSIGNED', 'CONFIRMED', 'DECLINED', 'REPLACED'];
export async function setOfficialStatus(officialId: UUID, status: OfficialStatus, actor: Actor = {}): Promise<void> {
  if (!OFFICIAL_STATUSES.includes(status)) throw new Error('invalid official status');
  await tx(async (client) => {
    await client.query(`UPDATE sport.match_official SET status=$2 WHERE id=$1`, [officialId, status]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'match_official', entityId: officialId, action: 'OFFICIAL_STATUS', after: { status } }, client
    );
  });
}
export async function removeMatchOfficial(officialId: UUID, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    await client.query(`DELETE FROM sport.match_official WHERE id=$1`, [officialId]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'match_official', entityId: officialId, action: 'REMOVE_OFFICIAL' }, client
    );
  });
}

// ── 실시간 기록 ───────────────────────────────────────────────────────────

export interface MatchSide { entry_id: UUID | null; side: string | null; label: string | null; score: string | null; }
export interface LiveState { scores?: Record<string, number>; period?: string | null; }
export interface MatchLive {
  id: UUID; event_id: UUID; status: string; round_name: string | null; match_no: string | null;
  scheduled_at: string | null; live_state: LiveState; sides: MatchSide[];
}
export async function getMatchLive(matchId: UUID): Promise<MatchLive | null> {
  const m = await queryOne<{ id: UUID; event_id: UUID; status: string; round_name: string | null; match_no: string | null; scheduled_at: string | null; live_state: LiveState }>(
    `SELECT id, event_id, status, round_name, match_no, scheduled_at::text AS scheduled_at, live_state
       FROM sport.match WHERE id = $1`, [matchId]
  );
  if (!m) return null;
  const sides = await query<MatchSide>(
    `SELECT mp.entry_id, mp.side, mp.score::text AS score,
            COALESCE(t.name_i18n->>'vi', p.full_name, mp.side) AS label
       FROM sport.match_participant mp
       LEFT JOIN sport.event_entry ee ON ee.id = mp.entry_id
       LEFT JOIN sport.team t ON t.id = ee.team_id
       LEFT JOIN core.person p ON p.id = ee.person_id
      WHERE mp.match_id = $1
      ORDER BY mp.side`,
    [matchId]
  );
  return { ...m, live_state: m.live_state ?? {}, sides };
}

export interface MatchEventRow {
  id: UUID; client_seq: number | null; period: string | null; side: string | null;
  kind: MatchEventKind; points: string | null; note: string | null; occurred_at: string;
}
export async function listMatchEvents(matchId: UUID, limit = 100): Promise<MatchEventRow[]> {
  return query<MatchEventRow>(
    `SELECT id, client_seq, period, side, kind, points::text AS points, payload->>'note' AS note, occurred_at::text AS occurred_at
       FROM sport.match_event WHERE match_id = $1 ORDER BY occurred_at DESC, client_seq DESC LIMIT $2`,
    [matchId, Math.min(Math.max(limit, 1), 500)]
  );
}

export interface AppendEventInput {
  kind: MatchEventKind; side?: string | null; points?: number | null; period?: string | null; clock?: string | null; note?: string | null; clientSeq?: number | null;
}
/** 이벤트 1건 기록. SCORE 면 live_state 러닝스코어에 반영. (match_id,client_seq) 멱등. */
export async function appendMatchEvent(matchId: UUID, input: AppendEventInput, actor: Actor = {}): Promise<UUID | null> {
  return tx(async (client) => {
    const seq = input.clientSeq ?? (await client.query<{ n: number }>(
      `SELECT COALESCE(max(client_seq),0)+1 AS n FROM sport.match_event WHERE match_id=$1`, [matchId]
    )).rows[0].n;
    const res = await client.query<{ id: UUID }>(
      `INSERT INTO sport.match_event (match_id, client_seq, period, clock, side, kind, points, payload, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (match_id, client_seq) DO NOTHING RETURNING id`,
      [matchId, seq, input.period ?? null, input.clock ?? null, input.side ?? null, input.kind,
       input.points ?? null, JSON.stringify(input.note ? { note: input.note } : {}), actor.personId ?? null]
    );
    const id = res.rows[0]?.id ?? null;
    if (!id) return null;

    // 경기를 LIVE 로 올리고, 득점이면 러닝스코어 갱신.
    if (input.kind === 'SCORE' && input.side) {
      const cur = (await client.query<{ live_state: LiveState; status: string }>(
        `SELECT live_state, status FROM sport.match WHERE id=$1`, [matchId]
      )).rows[0];
      const ls: LiveState = cur?.live_state ?? {};
      const scores = { ...(ls.scores ?? {}) };
      scores[input.side] = (scores[input.side] ?? 0) + (input.points ?? 1);
      await client.query(
        `UPDATE sport.match SET live_state = $2::jsonb, status = CASE WHEN status='SCHEDULED' THEN 'LIVE' ELSE status END WHERE id=$1`,
        [matchId, JSON.stringify({ ...ls, scores })]
      );
    } else {
      await client.query(`UPDATE sport.match SET status = CASE WHEN status='SCHEDULED' THEN 'LIVE' ELSE status END WHERE id=$1`, [matchId]);
    }
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'match_event', entityId: id, action: 'MATCH_EVENT',
        after: { kind: input.kind, side: input.side ?? null, points: input.points ?? null } }, client
    );
    return id;
  });
}

export async function setMatchStatus(matchId: UUID, status: string, actor: Actor = {}): Promise<void> {
  if (!['SCHEDULED', 'LIVE', 'FINISHED', 'CANCELLED'].includes(status)) throw new Error('invalid match status');
  await tx(async (client) => {
    await client.query(`UPDATE sport.match SET status=$2 WHERE id=$1`, [matchId, status]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'match', entityId: matchId, action: 'MATCH_STATUS', after: { status } }, client
    );
  });
}

/** 종료 확정 — 러닝스코어를 참가자 점수로 굳히고 승패를 정한 뒤 FINISHED. */
export async function finalizeMatch(matchId: UUID, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    const m = (await client.query<{ live_state: LiveState }>(`SELECT live_state FROM sport.match WHERE id=$1`, [matchId])).rows[0];
    const scores = m?.live_state?.scores ?? {};
    const parts = (await client.query<{ id: UUID; side: string | null }>(
      `SELECT id, side FROM sport.match_participant WHERE match_id=$1`, [matchId]
    )).rows;
    const vals = parts.map((p) => (p.side ? scores[p.side] ?? 0 : 0));
    const maxV = vals.length ? Math.max(...vals) : 0;
    const minV = vals.length ? Math.min(...vals) : 0;
    for (const p of parts) {
      const sc = p.side ? scores[p.side] ?? 0 : 0;
      const result = maxV === minV ? 'DRAW' : sc === maxV ? 'WIN' : 'LOSE';
      await client.query(`UPDATE sport.match_participant SET score=$2, result=$3 WHERE id=$1`, [p.id, sc, result]);
    }
    await client.query(`UPDATE sport.match SET status='FINISHED', synced_at=now() WHERE id=$1`, [matchId]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'match', entityId: matchId, action: 'FINALIZE', after: { scores } }, client
    );
  });
}

// ── 대회 운영 목록 (경기 네비) ────────────────────────────────────────────
export interface OpsMatchRow {
  id: UUID; event_id: UUID; event_name: I18nText; round_name: string | null;
  match_no: string | null; scheduled_at: string | null; status: string; official_count: number;
}
export async function listOpsMatches(filter: { eventId?: UUID | null } = {}): Promise<OpsMatchRow[]> {
  return query<OpsMatchRow>(
    `SELECT m.id, m.event_id, e.name_i18n AS event_name, m.round_name, m.match_no,
            m.scheduled_at::text AS scheduled_at, m.status,
            (SELECT count(*)::int FROM sport.match_official mo WHERE mo.match_id=m.id AND mo.status<>'DECLINED') AS official_count
       FROM sport.match m JOIN sport.event e ON e.id = m.event_id
      WHERE ($1::uuid IS NULL OR m.event_id = $1)
      ORDER BY m.scheduled_at DESC NULLS LAST, m.match_no`,
    [filter.eventId ?? null]
  );
}
