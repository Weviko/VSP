-- ============================================================================
-- 028. 지도자 자격 공개 계층 (pub)
--
-- 공개 지도자(pub.staff = 성인·초상권 동의 필터 적용)의 유효(VALID) 자격만 공개한다.
-- 전화·CCCD 등 PII 미포함. 공개 규칙(017/pub.staff) 재사용.
-- ============================================================================

CREATE OR REPLACE VIEW pub.coach_qualification AS
SELECT cr.person_id,
       st.full_name,
       st.name_latin,
       g.name_i18n AS grade_name,
       g.level_order,
       s.code AS sport_code,
       s.name_i18n AS sport_name,
       EXTRACT(YEAR FROM cr.obtained_on)::int AS obtained_year,
       EXTRACT(YEAR FROM cr.expires_on)::int AS expires_year,
       cr.status
  FROM coach.credential cr
  JOIN coach.grade g ON g.id = cr.grade_id
  LEFT JOIN sport.sport s ON s.id = cr.sport_id
  JOIN pub.staff st ON st.person_id = cr.person_id
 WHERE cr.status = 'VALID';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.coach_qualification TO vsp_portal;
  END IF;
END $$;
