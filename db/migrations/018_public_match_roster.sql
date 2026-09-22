-- 018_public_match_roster.sql
-- 경기 라인업(개별 선수) 공개 뷰. 네이버 스포츠처럼 경기 → 개별 선수로 드릴다운한다.
--   개인전: 참가자(entry)가 곧 선수.
--   단체전: 참가 팀에 등록된 공개 선수(승인·ATHLETE)들이 로스터.
-- 공개 대상(pub.athlete)만, 미성년은 애초에 pub.athlete 에서 제외/마스킹된다.

CREATE OR REPLACE VIEW pub.match_roster AS
-- 개인전
SELECT DISTINCT
       m.id            AS match_id,
       mp.side         AS side,
       a.person_id     AS person_id,
       a.full_name     AS full_name,
       a.name_latin    AS name_latin,
       ee.team_id      AS team_id,
       t.name_i18n     AS team_name
  FROM sport.match m
  JOIN pub.event e            ON e.id = m.event_id
  JOIN sport.match_participant mp ON mp.match_id = m.id
  JOIN sport.event_entry ee   ON ee.id = mp.entry_id
  JOIN pub.athlete a          ON a.person_id = ee.person_id
  LEFT JOIN sport.team t       ON t.id = ee.team_id
UNION
-- 단체전: 팀 로스터
SELECT DISTINCT
       m.id            AS match_id,
       mp.side         AS side,
       a.person_id     AS person_id,
       a.full_name     AS full_name,
       a.name_latin    AS name_latin,
       ee.team_id      AS team_id,
       t.name_i18n     AS team_name
  FROM sport.match m
  JOIN pub.event e            ON e.id = m.event_id
  JOIN sport.match_participant mp ON mp.match_id = m.id
  JOIN sport.event_entry ee   ON ee.id = mp.entry_id AND ee.person_id IS NULL AND ee.team_id IS NOT NULL
  JOIN sport.registration r   ON r.team_id = ee.team_id AND r.reg_type = 'ATHLETE' AND r.status = 'APPROVED'
  JOIN pub.athlete a          ON a.person_id = r.person_id
  JOIN sport.team t            ON t.id = ee.team_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.match_roster TO vsp_portal;
  END IF;
END $$;
