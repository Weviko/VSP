/**
 * 선수 통합검색.
 *
 * 대한체육회 선수통합검색을 그대로 옮긴 것이다.
 *   필터: 종목 · 지역 · 성별 · 이름
 *   컬럼: 번호 · 이름 · 출생년도 · 성별 · 지역 · 종목 · 종별 · 소속팀
 *
 * 중요: 생년월일 전체가 아니라 **출생년도만** 내보낸다.
 * 한국도 같은 방식이며, 우리 개인정보 공개 정책과도 일치한다.
 * 미성년자는 보호자 초상권 동의가 없으면 결과에서 제외한다.
 */
import { query, toLatinSearch, type UUID, type I18nText } from '@vsp/core-admin';

export interface AthleteSearchFilter {
  sportId?: UUID | null;
  regionCode?: string | null;
  gender?: 'M' | 'F' | null;
  name?: string | null;
  seasonId?: UUID | null;
  page?: number;
  pageSize?: number;
}

export interface AthleteSearchRow {
  person_id: UUID;
  full_name: string;
  name_latin: string | null;
  birth_year: number | null;
  gender: string | null;
  region_code: string | null;
  sport_name: I18nText;
  division: string | null;
  team_name: I18nText | null;
  org_name: I18nText;
}

export interface AthleteSearchResult {
  rows: AthleteSearchRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function searchAthletes(filter: AthleteSearchFilter): Promise<AthleteSearchResult> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filter.pageSize ?? 30));
  const offset = (page - 1) * pageSize;

  // 베트남어는 성조 때문에 그대로 비교하면 잘 안 맞는다.
  // "Nguyen" 으로 검색해도 "Nguyễn" 이 나와야 하므로 성조를 뗀 값으로 비교한다.
  const nameKey = filter.name ? toLatinSearch(filter.name) : null;

  const where = `
      r.reg_type = 'ATHLETE'
      AND r.status = 'APPROVED'
      AND p.deleted_at IS NULL
      AND ($1::uuid IS NULL OR r.sport_id = $1)
      AND ($2::text IS NULL OR o.region_code = $2)
      AND ($3::text IS NULL OR p.gender = $3)
      AND ($4::text IS NULL OR
           translate(lower(COALESCE(p.name_latin, p.full_name)),
                     'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
                     'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
           LIKE '%' || $4 || '%')
      AND ($5::uuid IS NULL OR r.season_id = $5)
      -- 미성년자는 보호자 초상권 동의가 있을 때만 노출한다
      AND (
        p.birth_date IS NULL
        OR EXTRACT(YEAR FROM age(p.birth_date)) >= 18
        OR EXISTS (
          SELECT 1 FROM core.consent c
           WHERE c.person_id = p.id AND c.consent_type = 'PORTRAIT'
             AND c.granted AND c.revoked_at IS NULL
        )
      )`;

  const params = [
    filter.sportId ?? null,
    filter.regionCode ?? null,
    filter.gender ?? null,
    nameKey,
    filter.seasonId ?? null,
  ];

  const countRows = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM sport.registration r
       JOIN core.person p ON p.id = r.person_id
       JOIN core.organization o ON o.id = r.org_id
      WHERE ${where}`,
    params
  );

  const rows = await query<AthleteSearchRow>(
    `SELECT p.id AS person_id, p.full_name, p.name_latin,
            EXTRACT(YEAR FROM p.birth_date)::int AS birth_year,
            p.gender, o.region_code,
            s.name_i18n AS sport_name,
            d.name_i18n->>'vi' AS division,
            t.name_i18n AS team_name,
            o.name_i18n AS org_name
       FROM sport.registration r
       JOIN core.person p ON p.id = r.person_id
       JOIN core.organization o ON o.id = r.org_id
       JOIN sport.sport s ON s.id = r.sport_id
       LEFT JOIN sport.discipline d ON d.id = r.primary_discipline_id
       LEFT JOIN sport.team t ON t.id = r.team_id
      WHERE ${where}
      ORDER BY p.full_name
      LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  return { rows, total: countRows[0]?.n ?? 0, page, pageSize };
}

/** 검색 필터 선택지 — 지역 목록은 조직에 실제로 쓰인 값에서 뽑는다 */
export async function listRegionCodes(): Promise<string[]> {
  const rows = await query<{ region_code: string }>(
    `SELECT DISTINCT region_code FROM core.organization
      WHERE region_code IS NOT NULL AND deleted_at IS NULL
      ORDER BY region_code`
  );
  return rows.map((r) => r.region_code);
}
