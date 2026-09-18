-- ============================================================================
-- 010. 순위판 (standings)
--
-- 네이버 종목 안 '순위' 탭은 종목마다 지표가 다르다(팀순위 승/패/승률·게임차, 타자기록,
-- 투수기록…). 컬럼을 스키마에 박으면 종목·리그마다 마이그레이션이 필요하다.
-- 그래서 순위판 하나 = {컬럼 목록 + 순위 행들}을 유연하게 담는다. box_score 와 같은 원칙.
--
-- 순위판(standing_board): 종목·리그·시즌·종류(팀순위/타자기록…)별로 하나.
-- 순위행(standing_entry): 팀 또는 선수 한 줄. cells 가 board.columns 에 대응.
--   선수 행은 person_id 로 두고, 공개 시 이름 마스킹(미성년 보호)을 그대로 적용한다.
-- ============================================================================

CREATE TABLE sport.standing_board (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id      uuid NOT NULL REFERENCES sport.sport(id),
  season_id     uuid REFERENCES core.season(id),
  league        text,                          -- 리그/부문 (예: 'V.League 1', 'KBO'). NULL=전체
  board_code    text NOT NULL,                 -- TEAM_STANDING / TEAM_RECORD / PLAYER_BAT / PLAYER_PITCH ...
  name_i18n     jsonb NOT NULL,                -- 순위판 이름 (팀 순위, 타자 기록 …)
  entity        text NOT NULL DEFAULT 'TEAM',  -- TEAM / PLAYER (개인기록은 이름 마스킹 대상)
  columns       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ["경기","승","패","승률"]
  computed_on   date NOT NULL DEFAULT CURRENT_DATE,
  sort_order    int NOT NULL DEFAULT 0,        -- 순위판 노출 순서 (탭 순서)
  UNIQUE(sport_id, season_id, league, board_code)
);

CREATE TABLE sport.standing_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      uuid NOT NULL REFERENCES sport.standing_board(id) ON DELETE CASCADE,
  rank          int NOT NULL,
  team_id       uuid REFERENCES sport.team(id),
  person_id     uuid REFERENCES core.person(id),
  label         text,                          -- 팀/선수 표시명 폴백 (team_id·person_id 없을 때)
  cells         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- board.columns 순서에 대응하는 값
  sort_order    int NOT NULL DEFAULT 0
);
CREATE INDEX ON sport.standing_entry(board_id, rank);

-- 공개 뷰: 순위판 자체는 집계라 공개(대회 승인과 무관). 종목이 있는 것만.
CREATE OR REPLACE VIEW pub.standing_board AS
SELECT b.id, b.sport_id, s.code AS sport_code, s.name_i18n AS sport_name,
       b.season_id, se.code AS season_code, se.name_i18n AS season_name,
       b.league, b.board_code, b.name_i18n, b.entity, b.columns, b.computed_on, b.sort_order
  FROM sport.standing_board b
  JOIN sport.sport s ON s.id = b.sport_id
  LEFT JOIN core.season se ON se.id = b.season_id
 WHERE s.status = 'ACTIVE';

-- 순위행: 선수 행은 pub_src.person_label 로 이름을 마스킹(미성년 비공개)한다.
CREATE OR REPLACE VIEW pub.standing_entry AS
SELECT e.board_id, e.rank,
       e.team_id, t.name_i18n AS team_name,
       pl.public_person_id AS person_id,
       COALESCE(t.name_i18n->>'vi', pl.label, e.label) AS label,
       e.cells
  FROM sport.standing_entry e
  JOIN sport.standing_board b ON b.id = e.board_id
  LEFT JOIN sport.team t ON t.id = e.team_id
  LEFT JOIN pub_src.person_label pl ON pl.person_id = e.person_id
 ORDER BY e.rank, e.sort_order;

DO $$
BEGIN
  GRANT SELECT ON pub.standing_board, pub.standing_entry TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 순위판 권한 부여를 건너뜁니다.';
END
$$;
