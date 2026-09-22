-- 017_public_staff.sql
-- 지도자(코치·감독·선수관리) 공개 뷰. 선수(pub.athlete)와 동일한 보호 규칙을 적용한다:
--   승인된 COACH/MANAGER 등록이 있고, 활성 상태이며, 성인이거나 초상권 동의가 있는 사람만 공개.
-- 대외 웹의 "지도자" 목록/프로필이 이 뷰만 읽는다(원본 테이블 접근 없음).

CREATE OR REPLACE VIEW pub.staff AS
SELECT p.id AS person_id,
       p.display_id,
       p.full_name,
       p.name_latin,
       p.gender,
       p.photo_url,
       EXTRACT(YEAR FROM p.birth_date)::int AS birth_year
  FROM core.person p
 WHERE p.deleted_at IS NULL
   AND p.status = 'ACTIVE'
   AND p.birth_date IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM sport.registration r
          WHERE r.person_id = p.id AND r.reg_type IN ('COACH', 'MANAGER') AND r.status = 'APPROVED'
       )
   AND (
         p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
         OR EXISTS (
              SELECT 1 FROM core.consent c
               WHERE c.person_id = p.id AND c.consent_type = 'PORTRAIT'
                 AND c.granted AND c.revoked_at IS NULL
            )
       );

CREATE OR REPLACE VIEW pub.staff_registration AS
SELECT r.id AS registration_id,
       r.person_id,
       r.reg_type,
       r.season_id,
       r.sport_id,
       s.code AS sport_code,
       s.name_i18n AS sport_name,
       r.org_id,
       o.name_i18n AS org_name,
       o.region_code,
       r.team_id,
       t.name_i18n AS team_name
  FROM sport.registration r
  JOIN pub.staff st ON st.person_id = r.person_id
  JOIN sport.sport s ON s.id = r.sport_id
  JOIN core.organization o ON o.id = r.org_id
  LEFT JOIN sport.team t ON t.id = r.team_id
 WHERE r.reg_type IN ('COACH', 'MANAGER')
   AND r.status = 'APPROVED';

-- 최소권한 대외 계정(있으면)에 읽기 부여. 007 의 기본권한과 동일 패턴.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.staff TO vsp_portal;
    GRANT SELECT ON pub.staff_registration TO vsp_portal;
  END IF;
END $$;
