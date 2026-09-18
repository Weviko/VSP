/**
 * 종목 체계.
 * 종목/세부종목/부문은 전부 데이터다. 종목을 추가할 때 코드를 고치지 않는다.
 */
import { query, queryOne, type UUID, type I18nText } from '@vsp/core-admin';

export interface Sport {
  id: UUID;
  code: string;
  name_i18n: I18nText;
  icon_url: string | null;
  governing_org_id: UUID | null;
  international_federation: string | null;
  is_olympic: boolean;
  is_asiad: boolean;
  is_seagames: boolean;
  default_match_format: string | null;
  sort_order: number;
  status: string;
}

export interface Discipline {
  id: UUID;
  sport_id: UUID;
  code: string;
  name_i18n: I18nText;
  match_format: string | null;
  sort_order: number;
}

export interface Category {
  id: UUID;
  discipline_id: UUID;
  code: string;
  name_i18n: I18nText;
  gender: string | null;
  age_min: number | null;
  age_max: number | null;
  weight_min: string | null;
  weight_max: string | null;
  team_size: number | null;
  sort_order: number;
}

export async function listSports(opts: { onlyActive?: boolean } = {}): Promise<Sport[]> {
  return query<Sport>(
    `SELECT * FROM sport.sport
      WHERE ($1::boolean IS NOT TRUE OR status = 'ACTIVE')
      ORDER BY sort_order, name_i18n->>'vi'`,
    [opts.onlyActive ?? false]
  );
}

export async function getSport(idOrCode: string): Promise<Sport | null> {
  return queryOne<Sport>(
    `SELECT * FROM sport.sport WHERE code = $1 OR id::text = $1 LIMIT 1`,
    [idOrCode]
  );
}

export async function listDisciplines(sportId: UUID): Promise<Discipline[]> {
  return query<Discipline>(
    `SELECT * FROM sport.discipline WHERE sport_id = $1 ORDER BY sort_order, code`,
    [sportId]
  );
}

export async function listCategories(disciplineId: UUID): Promise<Category[]> {
  return query<Category>(
    `SELECT * FROM sport.category WHERE discipline_id = $1 ORDER BY sort_order, code`,
    [disciplineId]
  );
}

/** 종목별 통계 — 공개 허브와 정부 보고 대시보드가 함께 쓴다 */
export interface SportStats {
  sport_id: UUID;
  athletes: number;
  coaches: number;
  referees: number;
  teams: number;
  upcoming_events: number;
  finished_events: number;
}

export async function getSportStats(sportId: UUID, seasonId?: UUID | null): Promise<SportStats> {
  const row = await queryOne<SportStats>(
    `SELECT $1::uuid AS sport_id,
       (SELECT count(*)::int FROM sport.registration r
         WHERE r.sport_id=$1 AND r.reg_type='ATHLETE' AND r.status='APPROVED'
           AND ($2::uuid IS NULL OR r.season_id=$2)) AS athletes,
       (SELECT count(*)::int FROM sport.registration r
         WHERE r.sport_id=$1 AND r.reg_type='COACH' AND r.status='APPROVED'
           AND ($2::uuid IS NULL OR r.season_id=$2)) AS coaches,
       (SELECT count(*)::int FROM sport.registration r
         WHERE r.sport_id=$1 AND r.reg_type='REFEREE' AND r.status='APPROVED'
           AND ($2::uuid IS NULL OR r.season_id=$2)) AS referees,
       (SELECT count(*)::int FROM sport.team t WHERE t.sport_id=$1 AND t.status='ACTIVE') AS teams,
       (SELECT count(*)::int FROM sport.event e
         WHERE e.sport_id=$1 AND e.starts_on >= CURRENT_DATE
           AND e.status <> 'CANCELLED') AS upcoming_events,
       (SELECT count(*)::int FROM sport.event e
         WHERE e.sport_id=$1 AND e.status='FINISHED') AS finished_events`,
    [sportId, seasonId ?? null]
  );
  return (
    row ?? {
      sport_id: sportId, athletes: 0, coaches: 0, referees: 0,
      teams: 0, upcoming_events: 0, finished_events: 0,
    }
  );
}
