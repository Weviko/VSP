/**
 * 통계 현황판.
 *
 * 대한체육회 '데이터' 탭을 대응한다. 이 화면 하나가 두 가지 일을 동시에 한다.
 *   1) 정부 보고 — 담당 공무원이 숫자를 바로 확인할 수 있다
 *   2) 대외 홍보 — 후원사와 언론이 규모를 파악한다
 *
 * 한국은 이것을 별도 사이트로 분리했지만, 우리는 공개 영역 안의 한 메뉴로 둔다.
 */
import { query, type UUID, type I18nText } from '@vsp/core-admin';

export interface RegistrationStats {
  reg_type: string;
  total: number;
  male: number;
  female: number;
}

export interface RegionStats {
  region_code: string | null;
  athletes: number;
  orgs: number;
}

export interface SportStatsRow {
  sport_id: UUID;
  sport_name: I18nText;
  athletes: number;
  events: number;
}

export interface AgeGroupStats {
  age_group: string;
  total: number;
}

export interface DashboardStats {
  byType: RegistrationStats[];
  byRegion: RegionStats[];
  bySport: SportStatsRow[];
  byAge: AgeGroupStats[];
  totals: { athletes: number; orgs: number; events: number; sports: number };
}

export async function getDashboardStats(seasonId?: UUID | null): Promise<DashboardStats> {
  const [byType, byRegion, bySport, byAge, totals] = await Promise.all([
    query<RegistrationStats>(
      `SELECT r.reg_type,
              count(*)::int AS total,
              count(*) FILTER (WHERE p.gender='M')::int AS male,
              count(*) FILTER (WHERE p.gender='F')::int AS female
         FROM sport.registration r
         JOIN core.person p ON p.id = r.person_id
        WHERE r.status='APPROVED'
          AND ($1::uuid IS NULL OR r.season_id = $1)
        GROUP BY r.reg_type
        ORDER BY count(*) DESC`,
      [seasonId ?? null]
    ),
    query<RegionStats>(
      `SELECT o.region_code,
              count(DISTINCT r.id) FILTER (WHERE r.reg_type='ATHLETE' AND r.status='APPROVED')::int AS athletes,
              count(DISTINCT o.id)::int AS orgs
         FROM core.organization o
         LEFT JOIN sport.registration r ON r.org_id = o.id
        WHERE o.deleted_at IS NULL AND o.region_code IS NOT NULL
        GROUP BY o.region_code
        ORDER BY athletes DESC, o.region_code`
    ),
    query<SportStatsRow>(
      `SELECT s.id AS sport_id, s.name_i18n AS sport_name,
              count(DISTINCT r.id) FILTER (WHERE r.reg_type='ATHLETE' AND r.status='APPROVED')::int AS athletes,
              count(DISTINCT e.id)::int AS events
         FROM sport.sport s
         LEFT JOIN sport.registration r ON r.sport_id = s.id
         LEFT JOIN sport.event e ON e.sport_id = s.id
        WHERE s.status='ACTIVE'
        GROUP BY s.id, s.name_i18n
        ORDER BY athletes DESC`
    ),
    // 연령대별 (한국 현황판과 동일하게 10대~50대 이상)
    query<AgeGroupStats>(
      `SELECT CASE
                WHEN p.birth_date IS NULL THEN 'unknown'
                WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 20 THEN '10s'
                WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 30 THEN '20s'
                WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 40 THEN '30s'
                WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 50 THEN '40s'
                ELSE '50s+'
              END AS age_group,
              count(*)::int AS total
         FROM sport.registration r
         JOIN core.person p ON p.id = r.person_id
        WHERE r.status='APPROVED'
          AND ($1::uuid IS NULL OR r.season_id = $1)
        GROUP BY 1
        ORDER BY 1`,
      [seasonId ?? null]
    ),
    query<{ athletes: number; orgs: number; events: number; sports: number }>(
      `SELECT
         (SELECT count(*)::int FROM sport.registration
           WHERE reg_type='ATHLETE' AND status='APPROVED') AS athletes,
         (SELECT count(*)::int FROM core.organization WHERE deleted_at IS NULL) AS orgs,
         (SELECT count(*)::int FROM sport.event WHERE status <> 'CANCELLED') AS events,
         (SELECT count(*)::int FROM sport.sport WHERE status='ACTIVE') AS sports`
    ),
  ]);

  return {
    byType,
    byRegion,
    bySport,
    byAge,
    totals: totals[0] ?? { athletes: 0, orgs: 0, events: 0, sports: 0 },
  };
}
