-- ============================================================================
-- 024. 도핑방지 공개 계층 (pub)
--
-- 대외 웹은 두 가지만 본다:
--   1) pub.antidoping_sanction — is_public 이고 확정(ACTIVE/SERVED)인 제재만, 성인 선수만.
--      (WADA Code 의 위반이력 공개 준용. 제재로 등록이 SUSPENDED 되어 pub.athlete 에서는 빠지므로,
--       공개 규칙상 여기서는 core.person 을 직접 조인하되 미성년(만 18세 미만)은 제외한다.)
--   2) pub.antidoping_stat — 연도별 검사·AAF·교육이수 건수(수치만, 개인정보 없음).
--
-- TUE·검사 원자료·시료·의료정보는 공개하지 않는다.
-- pub 뷰는 소유자 권한으로 base 테이블을 읽으므로 vsp_portal 은 core.person 직접권한 없이도 조회된다.
-- ============================================================================

CREATE OR REPLACE VIEW pub.antidoping_sanction AS
SELECT sn.id,
       p.full_name,
       p.name_latin,
       s.name_i18n AS sport_name,
       sn.adrv_article,
       sn.sanction_type,
       sn.starts_on,
       sn.ends_on,
       sn.decision_no,
       sn.status
  FROM antidoping.sanction sn
  JOIN core.person p ON p.id = sn.person_id
  LEFT JOIN sport.registration r ON r.id = sn.registration_id
  LEFT JOIN sport.sport s ON s.id = r.sport_id
 WHERE sn.is_public = true
   AND sn.status IN ('ACTIVE','SERVED')
   AND p.deleted_at IS NULL
   AND p.birth_date IS NOT NULL
   AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years';

CREATE OR REPLACE VIEW pub.antidoping_stat AS
SELECT yy.y::int AS year,
       (SELECT count(*) FROM antidoping.test t WHERE EXTRACT(YEAR FROM t.collected_at) = yy.y) AS tests,
       (SELECT count(*) FROM antidoping.test t WHERE EXTRACT(YEAR FROM t.collected_at) = yy.y AND t.outcome = 'AAF') AS aaf,
       (SELECT count(*) FROM antidoping.education_record e WHERE EXTRACT(YEAR FROM e.completed_on) = yy.y) AS educated
  FROM (SELECT DISTINCT EXTRACT(YEAR FROM collected_at) AS y FROM antidoping.test
        UNION
        SELECT DISTINCT EXTRACT(YEAR FROM completed_on) FROM antidoping.education_record) yy
 ORDER BY yy.y DESC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.antidoping_sanction TO vsp_portal;
    GRANT SELECT ON pub.antidoping_stat TO vsp_portal;
  END IF;
END $$;
