-- ============================================================================
-- 009. 경기 상세 — 종목별 기록표 + 공개 경기 뷰
--
-- 네이버 경기 상세처럼 종목마다 기록표 모양이 다르다(야구 이닝별 R·H·E, 축구 득점 시간,
-- 배구 세트 점수…). 종목별 컬럼을 스키마에 박으면 종목이 늘 때마다 마이그레이션이 필요하다.
-- 그래서 자유형 JSONB 한 칸(box_score)으로 흡수한다 — 설정으로 대응하는 이 프로젝트의 원칙.
--
--   box_score 예: { "columns": ["1","2","3","R","H","E"],
--                   "rows": [ {"side":"A","cells":["0","1","0","1","6","0"]}, ... ] }
--   화면은 columns/rows 가 있으면 표로 그리고, 없으면 참가자 점수만 보여준다.
-- ============================================================================

ALTER TABLE sport.match
  ADD COLUMN IF NOT EXISTS box_score jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 공개 경기 뷰: 승인·공개된 대회의 경기 한 줄. 참가자·점수는 pub.match_participant 로 조합.
CREATE OR REPLACE VIEW pub.match AS
SELECT m.id, m.event_id,
       e.sport_id, e.sport_code, e.sport_name,
       e.name_i18n AS event_name, e.venue_text,
       m.round_name, m.match_no, m.scheduled_at, m.status, m.box_score
  FROM sport.match m
  JOIN pub.event e ON e.id = m.event_id;

-- pub 스키마 기본 권한(007)으로도 부여되지만, 명시적으로도 준다. 역할이 없으면 조용히 넘어간다.
DO $$
BEGIN
  GRANT SELECT ON pub.match TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 pub.match 권한 부여를 건너뜁니다.';
END
$$;
