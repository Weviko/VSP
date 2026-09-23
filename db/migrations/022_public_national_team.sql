-- ============================================================================
-- 022. 국가대표 공개 계층 (pub)
--
-- 대외 웹은 두 가지만 본다:
--   1) pub.national_team — ACTIVE 대표팀 목록(종목·연령급·성별).
--   2) pub.national_team_member — APPROVED·FINALIZED 소집의 CONFIRMED 명단을,
--      pub.athlete 조인으로만 노출한다 → 성인/초상권 동의자만, 생년만, 미성년 자동 보호.
--
-- 공개 규칙(승인·비식별·미성년)의 본체는 007/pub.athlete 이며 여기서 재구현하지 않는다.
-- ============================================================================

CREATE OR REPLACE VIEW pub.national_team AS
SELECT nt.id,
       nt.sport_id,
       s.name_i18n AS sport_name,
       nt.name_i18n AS team_name,
       nt.age_class,
       nt.gender
  FROM sport.national_team nt
  JOIN sport.sport s ON s.id = nt.sport_id
 WHERE nt.status = 'ACTIVE';

-- 확정 명단(공개 대표선수만). pub.athlete 조인으로 미성년·비공개 선수는 자동 제외된다.
CREATE OR REPLACE VIEW pub.national_team_member AS
SELECT nt.id           AS national_team_id,
       c.id            AS callup_id,
       a.person_id,
       a.full_name,
       a.name_latin,
       a.birth_year,
       m.squad_role,
       m.jersey_no,
       s.name_i18n     AS sport_name,
       nt.name_i18n    AS team_name,
       nt.age_class,
       nt.gender,
       c.target_competition_name_i18n AS competition_name_i18n,
       c.starts_on,
       c.ends_on
  FROM sport.nt_member m
  JOIN sport.nt_callup c ON c.id = m.callup_id
       AND c.approval_status = 'APPROVED' AND c.status = 'FINALIZED'
  JOIN sport.national_team nt ON nt.id = c.national_team_id
  JOIN sport.sport s ON s.id = nt.sport_id
  JOIN pub.athlete a ON a.person_id = m.person_id
 WHERE m.member_status = 'CONFIRMED'
   AND m.squad_role IN ('ATHLETE','RESERVE');

-- 007 의 ALTER DEFAULT PRIVILEGES 로 신규 뷰에 vsp_portal SELECT 가 자동 부여되지만, 명시적으로도 준다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.national_team TO vsp_portal;
    GRANT SELECT ON pub.national_team_member TO vsp_portal;
  END IF;
END $$;
