/**
 * 공개 데이터 계층.
 *
 * 대외 웹사이트(apps/portal)는 이 패키지만 통해 데이터를 읽는다.
 * 여기 있는 SQL 은 모두 pub 스키마만 조회한다 (scripts/check-boundaries 가 검사한다).
 * 운영에서는 포털이 vsp_portal 역할로 접속하므로, 설령 누군가 원본 테이블을
 * 조회하는 코드를 넣어도 DB 가 거절한다.
 *
 * 공개 규칙(생년만, 미성년 보호, 승인된 것만)은 db/migrations/007_public_views.sql 에 있다.
 * 이 파일에서 규칙을 다시 구현하지 않는다 — 두 곳에 있으면 언젠가 어긋난다.
 *
 * 반환 모양은 업무 쪽 함수와 가능한 한 같게 맞췄다. 화면 코드를 옮길 때 필드명이 바뀌지 않도록.
 */
import { query, queryOne } from '@vsp/core-admin/db';
import { toLatinSearch, type I18nText } from '@vsp/core-admin/i18n';
import type { UUID } from '@vsp/core-admin/types';

// 대외 웹사이트가 쓰는 순수 도우미. 포털은 이 패키지 하나만 import 하면 되게 한다.
export { t, isLocale, LOCALES, DEFAULT_LOCALE, type Locale, type I18nText } from '@vsp/core-admin/i18n';
export { formatScore, formatVND, formatDateRange } from '@vsp/core-admin/format';
export { buildWorkbook, sheet, exportFileName, MONEY_FMT, i18nCell } from '@vsp/core-admin/export';
export { REG_TYPE_LABELS, REG_TYPES, type RegType } from '@vsp/sport-domain/labels';
export type { UUID };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 주소창에서 온 값은 무엇이든 들어온다. uuid 가 아니면 DB 오류(500) 대신 "없음"으로 처리한다. */
export function isUuid(v: string | null | undefined): v is UUID {
  return typeof v === 'string' && UUID_RE.test(v);
}

// ── 종목 ────────────────────────────────────────────────────────────────

export interface PublicSport {
  id: UUID;
  code: string;
  name_i18n: I18nText;
  icon_url: string | null;
  international_federation: string | null;
  is_olympic: boolean;
  is_asiad: boolean;
  is_seagames: boolean;
  sort_order: number;
}

/**
 * 헬스체크용 — DB 연결이 살아있는지 가볍게 확인한다(로드밸런서/모니터가 인증 없이 친다).
 * 대외 웹사이트는 읽기 전용 vsp_portal 롤로 붙으므로, 이 핑이 성공하면 그 경로도 살아있다는 뜻이다.
 */
export async function pingDb(): Promise<boolean> {
  const r = await queryOne<{ ok: number }>(`SELECT 1 AS ok`);
  return r?.ok === 1;
}

export async function listSports(): Promise<PublicSport[]> {
  return query<PublicSport>(`SELECT * FROM pub.sport ORDER BY sort_order, name_i18n->>'vi'`);
}

/** 주소의 종목 코드는 소문자로 온다 (/vi/taekwondo) */
export async function getSport(code: string): Promise<PublicSport | null> {
  return queryOne<PublicSport>(`SELECT * FROM pub.sport WHERE upper(code) = upper($1)`, [code]);
}

export interface SportStats {
  sport_id: UUID;
  athletes: number;
  coaches: number;
  referees: number;
  teams: number;
  upcoming_events: number;
  finished_events: number;
}

export async function listSportStats(): Promise<SportStats[]> {
  return query<SportStats>(
    `SELECT sport_id, athletes, coaches, referees, teams, upcoming_events, finished_events
       FROM pub.stat_by_sport`
  );
}

export async function getSportStats(sportId: UUID): Promise<SportStats> {
  const row = await queryOne<SportStats>(
    `SELECT sport_id, athletes, coaches, referees, teams, upcoming_events, finished_events
       FROM pub.stat_by_sport WHERE sport_id = $1`,
    [sportId]
  );
  return row ?? {
    sport_id: sportId, athletes: 0, coaches: 0, referees: 0,
    teams: 0, upcoming_events: 0, finished_events: 0,
  };
}

// ── 대회 ────────────────────────────────────────────────────────────────

export interface PublicEvent {
  id: UUID;
  code: string | null;
  name_i18n: I18nText;
  sport_id: UUID | null;
  sport_code: string | null;
  sport_name: I18nText | null;
  season_id: UUID;
  host_org_id: UUID;
  host_name: I18nText;
  event_level: string | null;
  event_type: string | null;
  is_ranked: boolean;
  decision_no: string | null;
  starts_on: string;
  ends_on: string;
  venue_text: string | null;
  entry_opens_at: string | null;
  entry_closes_at: string | null;
  poster_url: string | null;
  status: string;
  entry_count: number;
}

export async function listEvents(filter: {
  sportId?: UUID | null;
  /** 이 날짜 이후에 끝나는 대회 (진행 중 포함) */
  from?: string | null;
  /** 이 날짜 이전에 시작하는 대회 */
  to?: string | null;
  /** 끝난 대회만 — 결과 모음용 */
  finishedOnly?: boolean;
  limit?: number;
} = {}): Promise<PublicEvent[]> {
  const finished = filter.finishedOnly ?? false;
  return query<PublicEvent>(
    `SELECT * FROM pub.event
      WHERE ($1::uuid IS NULL OR sport_id = $1)
        AND ($2::date IS NULL OR ends_on >= $2)
        AND ($3::date IS NULL OR starts_on <= $3)
        AND ($4::boolean IS NOT TRUE OR ends_on < CURRENT_DATE OR status = 'FINISHED')
      ORDER BY CASE WHEN $4::boolean THEN ends_on END DESC NULLS LAST, starts_on
      LIMIT $5`,
    [filter.sportId ?? null, filter.from ?? null, filter.to ?? null, finished, filter.limit ?? 100]
  );
}

export async function getEvent(id: string): Promise<PublicEvent | null> {
  if (!isUuid(id)) return null;
  return queryOne<PublicEvent>(`SELECT * FROM pub.event WHERE id = $1`, [id]);
}

export interface PublicEntry {
  id: UUID;
  event_id: UUID;
  entry_type: string;
  seed_no: number | null;
  bib_no: string | null;
  /** 공개 가능한 선수일 때만 값이 있다. 없으면 프로필로 연결하지 않는다. */
  person_id: UUID | null;
  /** 공개 선수는 실명, 그 밖에는 머리글자 */
  label: string | null;
  team_name: I18nText | null;
  org_name: I18nText | null;
}

export async function listEntries(eventId: UUID): Promise<PublicEntry[]> {
  return query<PublicEntry>(
    `SELECT id, event_id, entry_type, seed_no, bib_no, person_id, label, team_name, org_name
       FROM pub.event_entry WHERE event_id = $1
      ORDER BY seed_no NULLS LAST, label`,
    [eventId]
  );
}

export interface PublicMatch {
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

export async function listMatches(eventId: UUID): Promise<PublicMatch[]> {
  const rows = await query<{
    match_id: UUID; event_id: UUID; round_name: string | null; match_no: string | null;
    scheduled_at: string | null; status: string;
    entry_id: UUID | null; side: string | null; label: string | null;
    score: string | null; result: string | null;
  }>(
    `SELECT match_id, event_id, round_name, match_no, scheduled_at, status,
            entry_id, side, label, score, result
       FROM pub.match_participant WHERE event_id = $1
      ORDER BY match_no, side`,
    [eventId]
  );
  const byMatch = new Map<UUID, PublicMatch>();
  for (const r of rows) {
    let m = byMatch.get(r.match_id);
    if (!m) {
      m = {
        id: r.match_id, event_id: r.event_id, round_name: r.round_name,
        match_no: r.match_no, scheduled_at: r.scheduled_at, status: r.status,
        participants: [],
      };
      byMatch.set(r.match_id, m);
    }
    if (r.entry_id || r.side) {
      m.participants.push({
        entry_id: r.entry_id, side: r.side, label: r.label, score: r.score, result: r.result,
      });
    }
  }
  return [...byMatch.values()];
}

// ── 오늘의 경기 (스코어보드) ──────────────────────────────────────────────

export interface ScoreCard {
  match_id: UUID;
  event_id: UUID;
  event_name: I18nText;
  sport_code: string | null;
  sport_name: I18nText | null;
  round_name: string | null;
  on_date: string;            // 표시용 날짜 (경기 예정일 또는 대회 시작일)
  status: string;             // SCHEDULED / LIVE / FINISHED / CANCELLED
  sides: Array<{ side: string | null; label: string | null; score: string | null; result: string | null }>;
}

/**
 * 여러 대회의 경기를 날짜로 모아 보여준다 (네이버 "오늘의 경기").
 * 상태별로 화면이 버튼을 달리 준다: 예정=응원 · 진행=중계 · 종료=기록.
 * 공개 대회의 경기만(pub.event 로 이미 걸러짐), 사람 속도의 소량 조회.
 */
export async function listScoreboard(filter: {
  from?: string | null;
  to?: string | null;
  sportId?: UUID | null;
  limit?: number;
} = {}): Promise<ScoreCard[]> {
  const rows = await query<{
    match_id: UUID; event_id: UUID; event_name: I18nText;
    sport_code: string | null; sport_name: I18nText | null;
    round_name: string | null; on_date: string; status: string;
    side: string | null; label: string | null; score: string | null; result: string | null;
  }>(
    `SELECT mp.match_id, mp.event_id, e.name_i18n AS event_name,
            e.sport_code, e.sport_name, mp.round_name,
            COALESCE(mp.scheduled_at::date, e.starts_on)::text AS on_date,
            mp.status, mp.side, mp.label, mp.score, mp.result
       FROM pub.match_participant mp
       JOIN pub.event e ON e.id = mp.event_id
      WHERE mp.status <> 'CANCELLED'
        AND ($1::date IS NULL OR COALESCE(mp.scheduled_at::date, e.starts_on) >= $1)
        AND ($2::date IS NULL OR COALESCE(mp.scheduled_at::date, e.starts_on) <= $2)
        AND ($3::uuid IS NULL OR e.sport_id = $3)
      ORDER BY on_date DESC, mp.match_id, mp.side
      LIMIT $4`,
    [filter.from ?? null, filter.to ?? null, filter.sportId ?? null, (filter.limit ?? 200) * 2]
  );
  const byMatch = new Map<UUID, ScoreCard>();
  for (const r of rows) {
    let c = byMatch.get(r.match_id);
    if (!c) {
      c = {
        match_id: r.match_id, event_id: r.event_id, event_name: r.event_name,
        sport_code: r.sport_code, sport_name: r.sport_name, round_name: r.round_name,
        on_date: r.on_date, status: r.status, sides: [],
      };
      byMatch.set(r.match_id, c);
    }
    if (r.side || r.label) c.sides.push({ side: r.side, label: r.label, score: r.score, result: r.result });
  }
  return [...byMatch.values()];
}

// ── 경기 상세 ─────────────────────────────────────────────────────────────

/** 종목별 기록표. columns/rows 가 있으면 표로, 없으면 참가자 점수만 표시. */
export interface BoxScore {
  columns?: string[];
  rows?: Array<{ side: string; label?: string; cells: Array<string | number> }>;
  [k: string]: unknown;
}

export interface PublicMatchDetail {
  id: UUID;
  event_id: UUID;
  event_name: I18nText;
  sport_id: UUID | null;
  sport_code: string | null;
  sport_name: I18nText | null;
  venue_text: string | null;
  round_name: string | null;
  match_no: string | null;
  scheduled_at: string | null;
  status: string;
  box_score: BoxScore;
  sides: Array<{ side: string | null; label: string | null; score: string | null; result: string | null }>;
}

/** 경기 한 건의 상세 (공개 대회의 경기만). */
export async function getMatch(matchId: string): Promise<PublicMatchDetail | null> {
  if (!isUuid(matchId)) return null;
  const head = await queryOne<Omit<PublicMatchDetail, 'sides'>>(
    `SELECT id, event_id, event_name, sport_id, sport_code, sport_name, venue_text,
            round_name, match_no, scheduled_at, status, box_score
       FROM pub.match WHERE id = $1`,
    [matchId]
  );
  if (!head) return null;
  const sides = await query<{ side: string | null; label: string | null; score: string | null; result: string | null }>(
    `SELECT side, label, score, result FROM pub.match_participant
      WHERE match_id = $1 AND (side IS NOT NULL OR label IS NOT NULL)
      ORDER BY side`,
    [matchId]
  );
  return { ...head, sides };
}

// ── 광고 (공개 노출) ──────────────────────────────────────────────────────

export interface PublicAd {
  slot_code: string;
  slot_name: I18nText;
  width: number | null;
  height: number | null;
  placement_id: UUID;
  sponsor_name: string | null;
  image_url: string | null;
  link_url: string | null;
}

/** 지면 코드로 지금 노출할 광고 1건 (활성·게재중·기간 내). 없으면 null → 아무것도 안 그린다. */
export async function getAd(slotCode: string): Promise<PublicAd | null> {
  return queryOne<PublicAd>(
    `SELECT slot_code, slot_name, width, height, placement_id, sponsor_name, image_url, link_url
       FROM pub.ad WHERE slot_code = $1 ORDER BY placement_id LIMIT 1`,
    [slotCode]
  );
}

// ── 팬 참여: 투표 · 응원 (공개 집계) ──────────────────────────────────────

export interface PollOptionPublic {
  id: UUID;
  label: string | null;
  person_id: UUID | null;
  team_name: I18nText | null;
  votes: number;
}
export interface PollPublic {
  id: UUID;
  title_i18n: I18nText;
  poll_type: string;
  event_id: UUID | null;
  sport_id: UUID | null;
  opens_at: string | null;
  closes_at: string | null;
  total_votes: number;
  options: PollOptionPublic[];
}

/** 열린 투표 목록 (선택지·득표 포함). 대회 연동 투표는 공개 대회만. */
export async function listOpenPolls(filter: { eventId?: string; limit?: number } = {}): Promise<PollPublic[]> {
  const event = filter.eventId && isUuid(filter.eventId) ? filter.eventId : null;
  const polls = await query<Omit<PollPublic, 'options'>>(
    `SELECT id, title_i18n, poll_type, event_id, sport_id, opens_at, closes_at, total_votes
       FROM pub.poll
      WHERE ($1::uuid IS NULL OR event_id = $1)
      ORDER BY opens_at DESC NULLS LAST
      LIMIT $2`,
    [event, filter.limit ?? 10]
  );
  if (polls.length === 0) return [];
  const ids = polls.map((p) => p.id);
  const opts = await query<PollOptionPublic & { poll_id: UUID }>(
    `SELECT id, poll_id, label, person_id, team_name, votes
       FROM pub.poll_option WHERE poll_id = ANY($1::uuid[]) ORDER BY sort_order, id`,
    [ids]
  );
  return polls.map((p) => ({ ...p, options: opts.filter((o) => o.poll_id === p.id) }));
}

/** 대상별 응원 수 (집계만). */
export async function cheerCount(targetType: 'PERSON' | 'TEAM' | 'EVENT' | 'ARTICLE', id: UUID): Promise<number> {
  const r = await queryOne<{ n: number }>(
    `SELECT n FROM pub.cheer_count WHERE target_type = $1 AND target_id = $2`,
    [targetType, id]
  );
  return r?.n ?? 0;
}

// ── 경기 상세 콘텐츠: 문자중계 · 영상 · 뉴스 ───────────────────────────────

export interface RelayItem {
  id: UUID;
  seq: number;
  clock: string | null;
  side: string | null;
  kind: string;
  text_i18n: I18nText;
}

/** 한 경기의 문자중계 (최근 시점이 위로). 공개 경기만 조회된다. */
export async function listMatchRelay(matchId: string): Promise<RelayItem[]> {
  if (!isUuid(matchId)) return [];
  return query<RelayItem>(
    `SELECT id, seq, clock, side, kind, text_i18n
       FROM pub.match_relay WHERE match_id = $1
      ORDER BY seq DESC`,
    [matchId]
  );
}

export interface VideoItem {
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
}

/** 영상 목록 (경기/대회/종목로 필터). 게시된 것만. */
export async function listVideos(filter: {
  matchId?: string;
  eventId?: string;
  sportId?: string;
  limit?: number;
} = {}): Promise<VideoItem[]> {
  const match = filter.matchId && isUuid(filter.matchId) ? filter.matchId : null;
  const event = filter.eventId && isUuid(filter.eventId) ? filter.eventId : null;
  const sport = filter.sportId && isUuid(filter.sportId) ? filter.sportId : null;
  return query<VideoItem>(
    `SELECT id, match_id, event_id, sport_id, title_i18n, provider, external_id, url,
            thumbnail_url, duration_seconds
       FROM pub.video
      WHERE ($1::uuid IS NULL OR match_id = $1)
        AND ($2::uuid IS NULL OR event_id = $2)
        AND ($3::uuid IS NULL OR sport_id = $3)
      ORDER BY sort_order, published_at DESC
      LIMIT $4`,
    [match, event, sport, filter.limit ?? 12]
  );
}

export interface NewsItem {
  id: UUID;
  slug: string;
  title_i18n: I18nText;
  summary_i18n: I18nText | null;
  cover_url: string | null;
  source: string;
  sport_id: UUID | null;
  event_id: UUID | null;
  byline_i18n: I18nText | null;
  published_at: string | null;
}

/** 뉴스 목록 (대회/종목으로 필터 가능). 게시된 기사만, 최신순. */
export async function listNews(filter: {
  eventId?: string;
  sportId?: string;
  limit?: number;
} = {}): Promise<NewsItem[]> {
  const event = filter.eventId && isUuid(filter.eventId) ? filter.eventId : null;
  const sport = filter.sportId && isUuid(filter.sportId) ? filter.sportId : null;
  return query<NewsItem>(
    `SELECT id, slug, title_i18n, summary_i18n, cover_url, source, sport_id, event_id,
            byline_i18n, published_at
       FROM pub.article
      WHERE ($1::uuid IS NULL OR event_id = $1)
        AND ($2::uuid IS NULL OR sport_id = $2)
      ORDER BY published_at DESC NULLS LAST
      LIMIT $3`,
    [event, sport, filter.limit ?? 20]
  );
}

export interface ArticleDetail extends NewsItem {
  body_i18n: I18nText | null;
  tags: string[] | null;
}

/** 기사 한 건 (slug). 게시된 것만. */
export async function getArticle(slug: string): Promise<ArticleDetail | null> {
  return queryOne<ArticleDetail>(
    `SELECT id, slug, title_i18n, summary_i18n, body_i18n, cover_url, source,
            sport_id, event_id, tags, byline_i18n, published_at
       FROM pub.article WHERE slug = $1`,
    [slug]
  );
}

// ── 후원 중개 공개 목록 ────────────────────────────────────────────────────

export interface SponsorshipOpenRow {
  person_id: UUID;
  full_name: string;
  name_latin: string | null;
  gender: string | null;
  birth_year: number;
  photo_url: string | null;
  headline_i18n: I18nText;
  followers: number;
}

/**
 * 후원 가능(open) 선수 목록. 성인·공개 선수만, 연락처 없이 인기 지표(구독자 수)와 함께.
 * 실제 제안은 로그인한 업무 플랫폼에서 넣는다(공개 웹은 읽기 전용).
 */
export async function listSponsorshipOpen(limit = 60): Promise<SponsorshipOpenRow[]> {
  return query<SponsorshipOpenRow>(
    `SELECT person_id, full_name, name_latin, gender, birth_year, photo_url, headline_i18n, followers
       FROM pub.sponsorship_open
      ORDER BY followers DESC, full_name
      LIMIT $1`,
    [limit]
  );
}

/** 개별 선수의 후원(open) 정보. 후원 대상이 아니면 null. 선수 상세의 후원 배너용. */
export async function getSponsorship(personId: string): Promise<SponsorshipOpenRow | null> {
  if (!isUuid(personId)) return null;
  return queryOne<SponsorshipOpenRow>(
    `SELECT person_id, full_name, name_latin, gender, birth_year, photo_url, headline_i18n, followers
       FROM pub.sponsorship_open WHERE person_id = $1`,
    [personId]
  );
}

// ── 지도자(코치·감독·선수관리) 공개 ────────────────────────────────────────

export interface StaffPerson {
  id: UUID;
  display_id: string | null;
  full_name: string;
  name_latin: string | null;
  gender: string | null;
  birth_year: number;
  photo_url: string | null;
}
export interface StaffRegistration {
  registration_id: UUID;
  reg_type: string;            // COACH / MANAGER
  sport_code: string | null;
  sport_name: I18nText;
  org_name: I18nText;
  region_code: string | null;
  team_name: I18nText | null;
}
export interface StaffListRow extends StaffPerson {
  reg_type: string;
  sport_name: I18nText | null;
  org_name: I18nText | null;
  region_code: string | null;
}

/** 지도자(코치·감독) 공개 목록. 한 사람당 한 행(대표 역할). */
export async function listStaff(filter: { sportId?: string | null; limit?: number } = {}): Promise<StaffListRow[]> {
  const sport = filter.sportId && isUuid(filter.sportId) ? filter.sportId : null;
  return query<StaffListRow>(
    `SELECT * FROM (
        SELECT DISTINCT ON (st.person_id)
               st.person_id AS id, st.display_id, st.full_name, st.name_latin,
               st.gender, st.birth_year, st.photo_url,
               sr.reg_type, sr.sport_name, sr.org_name, sr.region_code
          FROM pub.staff st
          JOIN pub.staff_registration sr ON sr.person_id = st.person_id
         WHERE ($1::uuid IS NULL OR sr.sport_id = $1)
         ORDER BY st.person_id, sr.reg_type
     ) x
     ORDER BY x.full_name
     LIMIT $2`,
    [sport, filter.limit ?? 200]
  );
}

/** 지도자 한 명의 공개 프로필 + 역할·소속. 지도자가 아니면 null. */
export async function getStaff(personId: string): Promise<{ person: StaffPerson; registrations: StaffRegistration[] } | null> {
  if (!isUuid(personId)) return null;
  const person = await queryOne<StaffPerson>(
    `SELECT person_id AS id, display_id, full_name, name_latin, gender, birth_year, photo_url
       FROM pub.staff WHERE person_id = $1`,
    [personId]
  );
  if (!person) return null;
  const registrations = await query<StaffRegistration>(
    `SELECT registration_id, reg_type, sport_code, sport_name, org_name, region_code, team_name
       FROM pub.staff_registration WHERE person_id = $1`,
    [personId]
  );
  return { person, registrations };
}

// ── 구독자 수 (MY팀 인기 지표) ────────────────────────────────────────────

/** 대상별 구독자 수 (공개 집계). 누가 구독했는지는 나오지 않는다. PERSON = 선수 팔로워. */
export async function subscriberCounts(
  targetType: 'SPORT' | 'ORG' | 'PERSON',
  ids: UUID[]
): Promise<Map<UUID, number>> {
  if (ids.length === 0) return new Map();
  const rows = await query<{ target_id: UUID; n: number }>(
    `SELECT target_id, n FROM pub.subscriber_count
      WHERE target_type = $1 AND target_id = ANY($2::uuid[])`,
    [targetType, ids]
  );
  return new Map(rows.map((r) => [r.target_id, r.n]));
}

export async function subscriberCount(targetType: 'SPORT' | 'ORG' | 'PERSON', id: UUID): Promise<number> {
  return (await subscriberCounts(targetType, [id])).get(id) ?? 0;
}

// ── 순위판 (standings) ────────────────────────────────────────────────────

export interface StandingBoard {
  id: UUID;
  sport_id: UUID;
  sport_code: string | null;
  sport_name: I18nText | null;
  season_id: UUID | null;
  season_code: string | null;
  season_name: I18nText | null;
  league: string | null;
  board_code: string;
  name_i18n: I18nText;
  entity: string;            // TEAM / PLAYER
  columns: string[];
  computed_on: string;
}

export interface StandingEntry {
  rank: number;
  team_id: UUID | null;
  team_name: I18nText | null;
  person_id: UUID | null;    // 공개 가능한 선수만 값이 있다(프로필 링크용)
  label: string | null;      // 팀명 또는 선수명(미성년은 뷰에서 머리글자로 마스킹됨)
  cells: Array<string | number>;
}

/** 순위판 목록 (탭·필터 구성용). sportId 로 좁히고, 리그·시즌으로 더 좁힌다. */
export async function listStandingBoards(filter: {
  sportId?: UUID | null;
  league?: string | null;
  seasonId?: UUID | null;
} = {}): Promise<StandingBoard[]> {
  return query<StandingBoard>(
    `SELECT id, sport_id, sport_code, sport_name, season_id, season_code, season_name,
            league, board_code, name_i18n, entity, columns, computed_on::text
       FROM pub.standing_board
      WHERE ($1::uuid IS NULL OR sport_id = $1)
        AND ($2::text IS NULL OR league = $2)
        AND ($3::uuid IS NULL OR season_id = $3)
      ORDER BY sort_order, computed_on DESC`,
    [filter.sportId ?? null, filter.league ?? null, filter.seasonId ?? null]
  );
}

/** 순위판 한 개의 표 (컬럼 + 순위 행). */
export async function getStandings(boardId: string): Promise<{ board: StandingBoard; entries: StandingEntry[] } | null> {
  if (!isUuid(boardId)) return null;
  const board = await queryOne<StandingBoard>(
    `SELECT id, sport_id, sport_code, sport_name, season_id, season_code, season_name,
            league, board_code, name_i18n, entity, columns, computed_on::text
       FROM pub.standing_board WHERE id = $1`,
    [boardId]
  );
  if (!board) return null;
  const entries = await query<StandingEntry>(
    `SELECT rank, team_id, team_name, person_id, label, cells
       FROM pub.standing_entry WHERE board_id = $1 ORDER BY rank`,
    [boardId]
  );
  return { board, entries };
}

export interface PublicResult {
  id: UUID;
  event_id: UUID;
  event_name: I18nText;
  starts_on: string;
  sport_code: string | null;
  final_rank: number | null;
  medal: string | null;
  record_value: string | null;
  record_unit: string | null;
  is_record: boolean;
  person_id: UUID | null;
  label: string | null;
  team_name: I18nText | null;
  org_name: I18nText | null;
}

export async function listEventResults(eventId: UUID): Promise<PublicResult[]> {
  return query<PublicResult>(
    `SELECT id, event_id, event_name, starts_on, sport_code, final_rank, medal,
            record_value, record_unit, is_record, person_id, label, team_name, org_name
       FROM pub.event_result WHERE event_id = $1
      ORDER BY final_rank NULLS LAST`,
    [eventId]
  );
}

// ── 선수 ────────────────────────────────────────────────────────────────

export interface PublicAthlete {
  id: UUID;
  display_id: string | null;
  full_name: string;
  name_latin: string | null;
  gender: string | null;
  birth_year: number;
  photo_url: string | null;
}

/** 공개 대상이 아니면(직원·반려자·보호자 동의 없는 미성년) null — 화면은 404 로 처리한다 */
export async function getAthlete(personId: string): Promise<PublicAthlete | null> {
  if (!isUuid(personId)) return null;
  return queryOne<PublicAthlete>(
    `SELECT person_id AS id, display_id, full_name, name_latin, gender, birth_year, photo_url
       FROM pub.athlete WHERE person_id = $1`,
    [personId]
  );
}

export interface PublicAthleteRegistration {
  id: UUID;
  person_id: UUID;
  full_name: string;
  sport_id: UUID;
  sport_code: string;
  sport_name: I18nText;
  org_name: I18nText;
  region_code: string | null;
  team_name: I18nText | null;
}

export async function listAthleteRegistrations(filter: {
  personId?: UUID | null;
  sportId?: UUID | null;
  limit?: number;
}): Promise<PublicAthleteRegistration[]> {
  return query<PublicAthleteRegistration>(
    `SELECT r.registration_id AS id, r.person_id, a.full_name,
            r.sport_id, r.sport_code, r.sport_name, r.org_name, r.region_code, r.team_name
       FROM pub.athlete_registration r
       JOIN pub.athlete a ON a.person_id = r.person_id
      WHERE ($1::uuid IS NULL OR r.person_id = $1)
        AND ($2::uuid IS NULL OR r.sport_id = $2)
      ORDER BY a.full_name
      LIMIT $3`,
    [filter.personId ?? null, filter.sportId ?? null, filter.limit ?? 100]
  );
}

export async function listAthleteResults(personId: UUID, limit = 50): Promise<PublicResult[]> {
  return query<PublicResult>(
    `SELECT id, event_id, event_name, starts_on, sport_code, final_rank, medal,
            record_value, record_unit, is_record, person_id, label, team_name, org_name
       FROM pub.event_result WHERE person_id = $1
      ORDER BY starts_on DESC
      LIMIT $2`,
    [personId, limit]
  );
}

export interface AthleteSearchFilter {
  sportId?: string | null;
  regionCode?: string | null;
  gender?: 'M' | 'F' | null;
  name?: string | null;
  page?: number;
  pageSize?: number;
}

export interface AthleteSearchRow {
  person_id: UUID;
  full_name: string;
  name_latin: string | null;
  birth_year: number;
  gender: string | null;
  region_code: string | null;
  sport_name: I18nText;
  division: string | null;
  team_name: I18nText | null;
  org_name: I18nText;
}

/**
 * 선수 통합검색 (대한체육회 선수통합검색과 같은 필터·컬럼).
 * 한 번에 100건까지만 준다 — 공개 검색을 통째로 긁어가지 못하게.
 */
export async function searchAthletes(filter: AthleteSearchFilter): Promise<{
  rows: AthleteSearchRow[]; total: number; page: number; pageSize: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filter.pageSize ?? 30));
  const offset = (page - 1) * pageSize;
  const sportId = isUuid(filter.sportId) ? filter.sportId : null;
  const nameKey = filter.name ? toLatinSearch(filter.name) : null;

  const where = `
        ($1::uuid IS NULL OR r.sport_id = $1)
    AND ($2::text IS NULL OR r.region_code = $2)
    AND ($3::text IS NULL OR a.gender = $3)
    AND ($4::text IS NULL OR a.name_key LIKE '%' || $4 || '%')`;
  const params = [sportId, filter.regionCode || null, filter.gender || null, nameKey];

  const [count, rows] = await Promise.all([
    queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pub.athlete_registration r JOIN pub.athlete a ON a.person_id = r.person_id
        WHERE ${where}`,
      params
    ),
    query<AthleteSearchRow>(
      `SELECT a.person_id, a.full_name, a.name_latin, a.birth_year, a.gender,
              r.region_code, r.sport_name, r.division_name->>'vi' AS division,
              r.team_name, r.org_name
         FROM pub.athlete_registration r JOIN pub.athlete a ON a.person_id = r.person_id
        WHERE ${where}
        ORDER BY a.full_name
        LIMIT ${pageSize} OFFSET ${offset}`,
      params
    ),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize };
}

// ── 단체 ────────────────────────────────────────────────────────────────

export interface PublicOrganization {
  id: UUID;
  display_id: string | null;
  parent_id: UUID | null;
  level_type: string;
  level_name: I18nText;
  level_order: number;
  name_i18n: I18nText;
  short_name: string | null;
  logo_url: string | null;
  region_code: string | null;
  established_at: string | null;
  effective_from: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  status: string;
  member_count: number;
}

// 트리에는 명부 렌더에 필요한 가벼운 컬럼만 담는다. member_count(상관 서브쿼리)는 제외한다 —
// 전 단체(1,500+)에 대해 행마다 집계가 도는 것을 막기 위함이다(뷰 미참조 컬럼은 플래너가 계산 생략).
export interface PublicOrgNode {
  id: UUID;
  display_id: string | null;
  parent_id: UUID | null;
  level_type: string;
  level_name: I18nText;
  level_order: number;
  name_i18n: I18nText;
  region_code: string | null;
  status: string;
  children: PublicOrgNode[];
}

type OrgNodeRow = Omit<PublicOrgNode, 'children'>;

/**
 * 단체 트리.
 * 상위 단체가 공개 대상이 아니면(심사 중 등) 하위 단체를 최상위로 올려서라도 보여준다.
 * 부모 하나 때문에 공개 단체가 명부에서 사라지면 안 된다.
 *
 * 성능: 성/시 지부까지 포함하면 단체가 1,500개를 넘는다. SELECT * 는 행마다 member_count
 * 서브쿼리를 돌리므로, 트리에 쓰는 가벼운 컬럼만 뽑는다(member_count 미참조 → 계산 생략).
 * 특정 level 만 필요하면 maxLevelOrder 로 하위(성/시)를 잘라 더 적게 가져온다.
 */
export async function getOrgTree(opts: { maxLevelOrder?: number } = {}): Promise<PublicOrgNode[]> {
  const rows = await query<OrgNodeRow>(
    `SELECT id, display_id, parent_id, level_type, level_name, level_order, name_i18n, region_code, status
       FROM pub.organization
      WHERE ($1::int IS NULL OR level_order <= $1)
      ORDER BY level_order, name_i18n->>'vi'`,
    [opts.maxLevelOrder ?? null]
  );
  const nodes = new Map<UUID, PublicOrgNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: PublicOrgNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parent_id ? nodes.get(n.parent_id) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

/** 단체별 하위(성/시 지부 등) 개수 — 명부에서 접힌 항목의 규모 표시용. 집계 한 방으로. */
export async function orgChildCounts(): Promise<Map<UUID, number>> {
  const rows = await query<{ parent_id: UUID; n: number }>(
    `SELECT parent_id, count(*)::int AS n FROM pub.organization
      WHERE parent_id IS NOT NULL GROUP BY parent_id`
  );
  return new Map(rows.map((r) => [r.parent_id, r.n]));
}

/** 회원종목단체 경영공시 — 국가 종목연맹 */
export async function listFederations(): Promise<PublicOrganization[]> {
  return query<PublicOrganization>(
    `SELECT * FROM pub.organization
      WHERE level_type = 'NATIONAL_FED'
      ORDER BY name_i18n->>'vi'`
  );
}

export async function listRegionCodes(): Promise<string[]> {
  const rows = await query<{ region_code: string }>(
    `SELECT DISTINCT region_code FROM pub.organization
      WHERE region_code IS NOT NULL ORDER BY region_code`
  );
  return rows.map((r) => r.region_code);
}

// ── 보조금 공시 ─────────────────────────────────────────────────────────

export interface GrantDisclosure {
  award_id: UUID;
  fiscal_year: number;
  org_name: I18nText;
  program_name: I18nText;
  summary: Record<string, unknown>;
  published_at: string;
}

export async function listGrantDisclosures(fiscalYear?: number | null): Promise<GrantDisclosure[]> {
  return query<GrantDisclosure>(
    `SELECT * FROM pub.grant_disclosure
      WHERE ($1::int IS NULL OR fiscal_year = $1)
      ORDER BY published_at DESC`,
    [fiscalYear ?? null]
  );
}

// ── 통계 ────────────────────────────────────────────────────────────────

export interface PublicStats {
  totals: { athletes: number; orgs: number; events: number; sports: number };
  byType: Array<{ reg_type: string; total: number; male: number; female: number }>;
  byRegion: Array<{ region_code: string; athletes: number; orgs: number }>;
  bySport: Array<{ sport_id: UUID; sport_name: I18nText; athletes: number; events: number }>;
  byAge: Array<{ age_group: string; total: number }>;
}

export async function getStats(): Promise<PublicStats> {
  const [totals, byType, byRegion, bySport, byAge] = await Promise.all([
    queryOne<PublicStats['totals']>(`SELECT * FROM pub.stat_totals`),
    query<PublicStats['byType'][number]>(`SELECT * FROM pub.stat_by_reg_type ORDER BY total DESC`),
    query<PublicStats['byRegion'][number]>(
      `SELECT * FROM pub.stat_by_region ORDER BY athletes DESC, region_code`
    ),
    query<PublicStats['bySport'][number]>(
      `SELECT sport_id, sport_name, athletes, upcoming_events + finished_events AS events
         FROM pub.stat_by_sport ORDER BY athletes DESC`
    ),
    query<PublicStats['byAge'][number]>(`SELECT * FROM pub.stat_by_age ORDER BY age_group`),
  ]);
  return {
    totals: totals ?? { athletes: 0, orgs: 0, events: 0, sports: 0 },
    byType, byRegion, bySport, byAge,
  };
}

// ── 증명서 진위확인 ─────────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean;
  revoked?: boolean;
  docNo?: string;
  title?: string;
  issuedAt?: string | null;
  orgName?: I18nText | null;
  subjectName?: string | null;
}

/** 코드 한 건에 한 건만 답한다. 목록 조회 경로는 없다 (DB 함수로만 열려 있다). 취소된 것은 revoked=true 로 알린다. */
export async function verifyCertificate(code: string): Promise<VerificationResult> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,20}$/.test(normalized)) return { valid: false };
  const row = await queryOne<{
    doc_no: string; title: string; issued_at: string | null;
    org_name: I18nText | null; subject_name: string | null; revoked: boolean;
  }>(`SELECT * FROM pub.verify_certificate($1)`, [normalized]);
  if (!row) return { valid: false };
  return {
    valid: true,
    revoked: row.revoked,
    docNo: row.doc_no,
    title: row.title,
    issuedAt: row.issued_at,
    orgName: row.org_name,
    subjectName: row.subject_name,
  };
}
