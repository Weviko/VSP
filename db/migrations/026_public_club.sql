-- ============================================================================
-- 026. 생활체육 클럽 공개 계층 (pub)
--
-- 승인·활성 클럽, 공개·모집 중 프로그램, 지역별 참여 통계만 공개한다.
-- 회원 개인정보는 노출하지 않는다(집계 수치만). 공개 규칙은 pub 한 곳.
-- ============================================================================

CREATE OR REPLACE VIEW pub.club AS
SELECT c.id, c.name_i18n, c.short_name, c.sport_id, s.name_i18n AS sport_name,
       c.region_code, c.club_type, c.venue_text,
       (SELECT count(*) FROM sport.club_member m WHERE m.club_id = c.id AND m.status = 'ACTIVE') AS member_count
  FROM sport.club c
  JOIN sport.sport s ON s.id = c.sport_id
 WHERE c.status = 'APPROVED';

CREATE OR REPLACE VIEW pub.club_program AS
SELECT pr.id, pr.club_id, c.name_i18n AS club_name, c.region_code,
       pr.name_i18n, pr.category, pr.schedule_text, pr.capacity,
       (SELECT count(*) FROM sport.club_program_enrollment e WHERE e.program_id = pr.id AND e.status = 'CONFIRMED') AS enrolled_count,
       pr.starts_on, pr.ends_on
  FROM sport.club_program pr
  JOIN sport.club c ON c.id = pr.club_id
 WHERE pr.is_public = true AND pr.status = 'OPEN' AND c.status = 'APPROVED';

CREATE OR REPLACE VIEW pub.stat_club_by_region AS
SELECT c.region_code,
       count(DISTINCT c.id) AS clubs,
       (SELECT count(*) FROM sport.club_member m JOIN sport.club cc ON cc.id = m.club_id
         WHERE cc.region_code IS NOT DISTINCT FROM c.region_code AND cc.status = 'APPROVED' AND m.status = 'ACTIVE') AS members,
       (SELECT count(*) FROM sport.club_program pr JOIN sport.club cc ON cc.id = pr.club_id
         WHERE cc.region_code IS NOT DISTINCT FROM c.region_code AND cc.status = 'APPROVED' AND pr.is_public AND pr.status = 'OPEN') AS programs
  FROM sport.club c
 WHERE c.status = 'APPROVED'
 GROUP BY c.region_code;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.club TO vsp_portal;
    GRANT SELECT ON pub.club_program TO vsp_portal;
    GRANT SELECT ON pub.stat_club_by_region TO vsp_portal;
  END IF;
END $$;
