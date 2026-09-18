/**
 * 대회 · 행사.
 *
 * 개최 신청은 core의 동적 폼 + 결재 엔진을 그대로 쓴다.
 * 베트남 체육법상 국내 고성과 대회는 서류 접수 후 10일 이내에 결정해야 하므로
 * 폼 정의의 sla_days 로 마감을 자동 계산하고, 결재 대기 목록에서 지연 건을 맨 위에 올린다.
 */
import { query, queryOne, tx, writeAudit, type UUID, type I18nText } from '@vsp/core-admin';
import { generateBracket, UnsupportedFormatError } from './bracket/index';
import type { BracketEntrant, MatchFormat } from './bracket/types';

export interface SportEvent {
  id: UUID;
  code: string | null;
  name_i18n: I18nText;
  sport_id: UUID | null;
  season_id: UUID;
  host_org_id: UUID;
  organizer_org_id: UUID | null;
  approval_submission_id: UUID | null;
  approval_status: string;
  approved_at: string | null;
  decision_no: string | null;
  event_level: string | null;
  event_type: string | null;
  is_ranked: boolean;
  starts_on: string;
  ends_on: string;
  venue_id: UUID | null;
  venue_text: string | null;
  entry_opens_at: string | null;
  entry_closes_at: string | null;
  max_entries: number | null;
  poster_url: string | null;
  is_public: boolean;
  status: string;
}

export interface EventRow extends SportEvent {
  sport_name: I18nText | null;
  host_name: I18nText;
  entry_count: number;
}

export async function listEvents(filter: {
  sportId?: UUID | null;
  orgId?: UUID | null;
  seasonId?: UUID | null;
  status?: string | null;
  from?: string | null;
  publicOnly?: boolean;
  limit?: number;
} = {}): Promise<EventRow[]> {
  return query<EventRow>(
    `SELECT e.*, s.name_i18n AS sport_name, o.name_i18n AS host_name,
            (SELECT count(*)::int FROM sport.event_entry ee
              WHERE ee.event_id = e.id AND ee.status <> 'WITHDRAWN') AS entry_count
       FROM sport.event e
       LEFT JOIN sport.sport s ON s.id = e.sport_id
       JOIN core.organization o ON o.id = e.host_org_id
      WHERE ($1::uuid IS NULL OR e.sport_id = $1)
        AND ($2::uuid IS NULL OR e.host_org_id = $2)
        AND ($3::uuid IS NULL OR e.season_id = $3)
        AND ($4::text IS NULL OR e.status = $4)
        AND ($5::date IS NULL OR e.ends_on >= $5)
        AND ($6::boolean IS NOT TRUE OR (e.is_public AND e.approval_status = 'APPROVED'))
      ORDER BY e.starts_on
      LIMIT $7`,
    [
      filter.sportId ?? null, filter.orgId ?? null, filter.seasonId ?? null,
      filter.status ?? null, filter.from ?? null, filter.publicOnly ?? false,
      filter.limit ?? 100,
    ]
  );
}

export async function getEvent(id: UUID): Promise<EventRow | null> {
  const rows = await query<EventRow>(
    `SELECT e.*, s.name_i18n AS sport_name, o.name_i18n AS host_name,
            (SELECT count(*)::int FROM sport.event_entry ee
              WHERE ee.event_id = e.id AND ee.status <> 'WITHDRAWN') AS entry_count
       FROM sport.event e
       LEFT JOIN sport.sport s ON s.id = e.sport_id
       JOIN core.organization o ON o.id = e.host_org_id
      WHERE e.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export interface CreateEventInput {
  nameI18n: I18nText;
  sportId?: UUID | null;
  seasonId: UUID;
  hostOrgId: UUID;
  eventLevel?: string | null;
  eventType?: string | null;
  startsOn: string;
  endsOn: string;
  venueText?: string | null;
  entryOpensAt?: string | null;
  entryClosesAt?: string | null;
  approvalSubmissionId?: UUID | null;
}

/**
 * 대회 생성.
 * 승인 전에는 approval_status='SUBMITTED', 공개되지 않는다.
 * 승인 결정이 나야 공개되고 기록이 공식으로 인정된다(승인대회 개념).
 */
export async function createEvent(
  input: CreateEventInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<SportEvent> {
  return tx(async (client) => {
    const res = await client.query<SportEvent>(
      `INSERT INTO sport.event
         (name_i18n, sport_id, season_id, host_org_id, event_level, event_type,
          starts_on, ends_on, venue_text, entry_opens_at, entry_closes_at,
          approval_submission_id, approval_status, is_public, status)
       VALUES ($1::jsonb,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               CASE WHEN $12::uuid IS NULL THEN 'DRAFT' ELSE 'SUBMITTED' END,
               false, 'PLANNED')
       RETURNING *`,
      [
        JSON.stringify(input.nameI18n), input.sportId ?? null, input.seasonId,
        input.hostOrgId, input.eventLevel ?? null, input.eventType ?? null,
        input.startsOn, input.endsOn, input.venueText ?? null,
        input.entryOpensAt ?? null, input.entryClosesAt ?? null,
        input.approvalSubmissionId ?? null,
      ]
    );
    const ev = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'event', entityId: ev.id,
        action: 'INSERT', after: { name: input.nameI18n, starts_on: input.startsOn },
      },
      client
    );
    return ev;
  });
}

export interface EventPatch {
  nameI18n?: I18nText;
  eventLevel?: string | null;
  eventType?: string | null;
  startsOn?: string;
  endsOn?: string;
  venueText?: string | null;
  entryOpensAt?: string | null;
  entryClosesAt?: string | null;
}

/**
 * 대회 정보 수정 (이름·일정·장소·유형 정정). 승인·공개 상태는 approveEvent 가 따로 다룬다.
 * 읽고-합치고-쓰기로 넘어온 값만 바꾸고 변경 전/후를 감사기록에 남긴다.
 */
export async function updateEvent(
  id: UUID,
  patch: EventPatch,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<SportEvent> {
  return tx(async (client) => {
    const before = (await client.query<SportEvent>(`SELECT * FROM sport.event WHERE id=$1`, [id])).rows[0];
    if (!before) throw new Error('event not found');
    const has = <K extends keyof EventPatch>(k: K) => patch[k] !== undefined;
    const m = {
      name_i18n: has('nameI18n') ? patch.nameI18n : before.name_i18n,
      event_level: has('eventLevel') ? patch.eventLevel : before.event_level,
      event_type: has('eventType') ? patch.eventType : before.event_type,
      starts_on: has('startsOn') ? patch.startsOn : before.starts_on,
      ends_on: has('endsOn') ? patch.endsOn : before.ends_on,
      venue_text: has('venueText') ? patch.venueText : before.venue_text,
      entry_opens_at: has('entryOpensAt') ? patch.entryOpensAt : before.entry_opens_at,
      entry_closes_at: has('entryClosesAt') ? patch.entryClosesAt : before.entry_closes_at,
    };
    const res = await client.query<SportEvent>(
      `UPDATE sport.event
          SET name_i18n=$2::jsonb, event_level=$3, event_type=$4,
              starts_on=$5::date, ends_on=$6::date, venue_text=$7,
              entry_opens_at=$8, entry_closes_at=$9, updated_at=now()
        WHERE id=$1 RETURNING *`,
      [id, JSON.stringify(m.name_i18n), m.event_level, m.event_type,
       m.starts_on, m.ends_on, m.venue_text, m.entry_opens_at, m.entry_closes_at]
    );
    const after = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'event', entityId: id,
        action: 'UPDATE', before, after,
      },
      client
    );
    return after;
  });
}

/**
 * 개최 승인 확정.
 * 승인되면 공개되고 결과가 공식 기록으로 인정된다.
 */
export async function approveEvent(
  eventId: UUID,
  decisionNo: string | null,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE sport.event
          SET approval_status='APPROVED', approved_at=now(), decision_no=$2,
              is_public=true, updated_at=now()
        WHERE id=$1`,
      [eventId, decisionNo]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'event', entityId: eventId,
        action: 'APPROVE', after: { decision_no: decisionNo },
      },
      client
    );
  });
}

// ── 참가 신청 ────────────────────────────────────────────────────────
export interface EventEntry {
  id: UUID;
  event_id: UUID;
  event_category_id: UUID | null;
  entry_type: string;
  person_id: UUID | null;
  team_id: UUID | null;
  submitted_org_id: UUID | null;
  registration_id: UUID | null;
  seed_no: number | null;
  bib_no: string | null;
  eligibility_check: Record<string, unknown> | null;
  status: string;
}

export interface EntryRow extends EventEntry {
  person_name: string | null;
  team_name: I18nText | null;
  org_name: I18nText | null;
}

export async function listEntries(eventId: UUID): Promise<EntryRow[]> {
  return query<EntryRow>(
    `SELECT ee.*, p.full_name AS person_name, t.name_i18n AS team_name,
            o.name_i18n AS org_name
       FROM sport.event_entry ee
       LEFT JOIN core.person p ON p.id = ee.person_id
       LEFT JOIN sport.team t ON t.id = ee.team_id
       LEFT JOIN core.organization o ON o.id = ee.submitted_org_id
      WHERE ee.event_id = $1
      ORDER BY ee.seed_no NULLS LAST, p.full_name`,
    [eventId]
  );
}

export interface AddEntryInput {
  eventId: UUID;
  eventCategoryId?: UUID | null;
  personId?: UUID | null;
  teamId?: UUID | null;
  submittedOrgId?: UUID | null;
  seedNo?: number | null;
  /** 자격 검증 결과. 협회 대행 입력 시에도 반드시 기록한다. */
  eligibilityCheck?: Record<string, unknown> | null;
}

/**
 * 참가 신청 등록.
 * 기본은 소속 단체 대행이고, 선수 개인 신청도 같은 경로를 쓴다.
 * 자격 검증 결과를 함께 저장해 나중에 "왜 통과시켰나"를 설명할 수 있게 한다.
 */
export async function addEntry(input: AddEntryInput): Promise<EventEntry> {
  const rows = await query<EventEntry>(
    `INSERT INTO sport.event_entry
       (event_id, event_category_id, entry_type, person_id, team_id,
        submitted_org_id, seed_no, eligibility_check, status)
     VALUES ($1,$2,
             CASE WHEN $4::uuid IS NOT NULL THEN 'TEAM' ELSE 'INDIVIDUAL' END,
             $3,$4,$5,$6,$7::jsonb,'PENDING')
     RETURNING *`,
    [
      input.eventId, input.eventCategoryId ?? null,
      input.personId ?? null, input.teamId ?? null, input.submittedOrgId ?? null,
      input.seedNo ?? null,
      input.eligibilityCheck ? JSON.stringify(input.eligibilityCheck) : null,
    ]
  );
  return rows[0];
}

// ── 대진 생성 ────────────────────────────────────────────────────────
export interface GenerateDrawResult {
  created: number;
  format: MatchFormat;
  notes: string[];
}

/**
 * 확정된 참가자로 대진을 만들어 경기 레코드를 생성한다.
 * 아직 구현되지 않은 방식이면 명확한 에러를 던지고, 화면은 수동 입력으로 안내한다.
 */
export async function generateDraw(
  eventId: UUID,
  format: MatchFormat,
  opts: { categoryId?: UUID | null; options?: Record<string, unknown> } = {}
): Promise<GenerateDrawResult> {
  const entries = await query<{ id: UUID; label: string; seed_no: number | null; org_id: UUID | null }>(
    `SELECT ee.id,
            COALESCE(p.full_name, t.name_i18n->>'vi', 'N/A') AS label,
            ee.seed_no, ee.submitted_org_id AS org_id
       FROM sport.event_entry ee
       LEFT JOIN core.person p ON p.id = ee.person_id
       LEFT JOIN sport.team t ON t.id = ee.team_id
      WHERE ee.event_id = $1
        AND ($2::uuid IS NULL OR ee.event_category_id = $2)
        AND ee.status IN ('PENDING','CONFIRMED')
      ORDER BY ee.seed_no NULLS LAST`,
    [eventId, opts.categoryId ?? null]
  );

  const entrants: BracketEntrant[] = entries.map((e) => ({
    entryId: e.id, label: e.label, seed: e.seed_no, orgId: e.org_id,
  }));

  const result = generateBracket(format, { entrants, options: opts.options });

  return tx(async (client) => {
    // 재생성 시 아직 치르지 않은 경기만 지운다 (결과가 입력된 경기는 보존)
    await client.query(
      `DELETE FROM sport.match
        WHERE event_id = $1
          AND ($2::uuid IS NULL OR event_category_id = $2)
          AND status = 'SCHEDULED'`,
      [eventId, opts.categoryId ?? null]
    );

    for (const m of result.matches) {
      const mr = await client.query<{ id: UUID }>(
        `INSERT INTO sport.match (event_id, event_category_id, round_name, match_no, status)
         VALUES ($1,$2,$3,$4,'SCHEDULED') RETURNING id`,
        [eventId, opts.categoryId ?? null, m.roundName, m.matchNo]
      );
      for (const p of m.participants) {
        await client.query(
          `INSERT INTO sport.match_participant (match_id, entry_id, side, lane_no)
           VALUES ($1,$2,$3,$4)`,
          [mr.rows[0].id, p.entryId, p.side, p.laneNo ?? null]
        );
      }
    }

    await writeAudit(
      {
        entitySchema: 'sport', entityTable: 'event', entityId: eventId,
        action: 'GENERATE_DRAW',
        after: { format, matches: result.matches.length, notes: result.notes },
      },
      client
    );

    return { created: result.matches.length, format: result.format, notes: result.notes };
  });
}

export { UnsupportedFormatError };

// ── 경기 · 결과 ──────────────────────────────────────────────────────
export interface MatchRow {
  id: UUID;
  event_id: UUID;
  round_name: string | null;
  match_no: string | null;
  scheduled_at: string | null;
  status: string;
  participants: Array<{
    entry_id: UUID | null;
    side: string | null;
    label: string | null;
    score: string | null;
    result: string | null;
  }>;
}

export async function listMatches(eventId: UUID): Promise<MatchRow[]> {
  const rows = await query<{
    id: UUID; event_id: UUID; round_name: string | null; match_no: string | null;
    scheduled_at: string | null; status: string;
    entry_id: UUID | null; side: string | null; label: string | null;
    score: string | null; result: string | null;
  }>(
    `SELECT m.id, m.event_id, m.round_name, m.match_no, m.scheduled_at, m.status,
            mp.entry_id, mp.side, mp.score, mp.result,
            COALESCE(p.full_name, t.name_i18n->>'vi') AS label
       FROM sport.match m
       LEFT JOIN sport.match_participant mp ON mp.match_id = m.id
       LEFT JOIN sport.event_entry ee ON ee.id = mp.entry_id
       LEFT JOIN core.person p ON p.id = ee.person_id
       LEFT JOIN sport.team t ON t.id = ee.team_id
      WHERE m.event_id = $1
      ORDER BY m.match_no, mp.side`,
    [eventId]
  );

  const byMatch = new Map<UUID, MatchRow>();
  for (const r of rows) {
    if (!byMatch.has(r.id)) {
      byMatch.set(r.id, {
        id: r.id, event_id: r.event_id, round_name: r.round_name,
        match_no: r.match_no, scheduled_at: r.scheduled_at, status: r.status,
        participants: [],
      });
    }
    if (r.entry_id || r.side) {
      byMatch.get(r.id)!.participants.push({
        entry_id: r.entry_id, side: r.side, label: r.label,
        score: r.score, result: r.result,
      });
    }
  }
  return [...byMatch.values()];
}

/**
 * 경기 결과 입력.
 * 베트남 체육관은 인터넷이 자주 끊긴다. 현장에서 모바일에 저장했다가
 * 연결이 돌아오면 올릴 수 있도록 기기 식별자와 동기화 시각을 함께 기록한다.
 */
export async function recordMatchResult(
  matchId: UUID,
  results: Array<{ entryId: UUID; score?: number | null; result?: string | null }>,
  actor: { personId?: UUID | null; deviceRef?: string | null } = {}
): Promise<void> {
  await tx(async (client) => {
    for (const r of results) {
      await client.query(
        `UPDATE sport.match_participant
            SET score = $3, result = $4
          WHERE match_id = $1 AND entry_id = $2`,
        [matchId, r.entryId, r.score ?? null, r.result ?? null]
      );
    }
    await client.query(
      `UPDATE sport.match
          SET status='FINISHED', synced_at=now(), device_ref=COALESCE($2, device_ref)
        WHERE id=$1`,
      [matchId, actor.deviceRef ?? null]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId,
        entitySchema: 'sport', entityTable: 'match', entityId: matchId,
        action: 'RECORD_RESULT', after: { results },
      },
      client
    );
  });
}

/** 대회 최종 성적 (공개 페이지와 선수 프로필의 원천) */
export interface ResultRow {
  id: UUID;
  event_id: UUID;
  person_id: UUID | null;
  team_id: UUID | null;
  org_id: UUID | null;
  final_rank: number | null;
  medal: string | null;
  record_value: string | null;
  record_unit: string | null;
  is_record: boolean;
  person_name: string | null;
  org_name: I18nText | null;
}

export async function listEventResults(eventId: UUID): Promise<ResultRow[]> {
  return query<ResultRow>(
    `SELECT er.*, p.full_name AS person_name, o.name_i18n AS org_name
       FROM sport.event_result er
       LEFT JOIN core.person p ON p.id = er.person_id
       LEFT JOIN core.organization o ON o.id = er.org_id
      WHERE er.event_id = $1
      ORDER BY er.final_rank NULLS LAST`,
    [eventId]
  );
}

/** 선수 한 명의 성적 이력 (프로필 페이지) */
export async function listPersonResults(personId: UUID, limit = 50): Promise<ResultRow[]> {
  return query<ResultRow>(
    `SELECT er.*, p.full_name AS person_name, o.name_i18n AS org_name,
            e.name_i18n AS event_name, e.starts_on
       FROM sport.event_result er
       JOIN sport.event e ON e.id = er.event_id
       LEFT JOIN core.person p ON p.id = er.person_id
       LEFT JOIN core.organization o ON o.id = er.org_id
      WHERE er.person_id = $1 AND e.is_public
      ORDER BY e.starts_on DESC
      LIMIT $2`,
    [personId, limit]
  );
}
