-- =====================================================================
-- VSP 002: SPORT-DOMAIN (체육 도메인)
-- core 스키마 위에 얹히는 체육 전용 로직. core는 이 스키마를 모른다.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS sport;

-- ---------------------------------------------------------------------
-- 종목 체계: 종목 → 세부종목 → 부문(체급/연령/성별)
-- 전부 데이터. 종목 추가에 코드 수정이 필요 없어야 한다.
-- ---------------------------------------------------------------------
CREATE TABLE sport.sport (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,          -- 'FOOTBALL','TAEKWONDO','SWIMMING'
  name_i18n     jsonb NOT NULL,
  icon_url      text,
  -- 관장 조직 (국가연맹)
  governing_org_id uuid REFERENCES core.organization(id),
  -- 국제연맹 정보
  international_federation text,               -- 'FIFA','WT','WA'
  is_olympic    boolean NOT NULL DEFAULT false,
  is_asiad      boolean NOT NULL DEFAULT false,
  is_seagames   boolean NOT NULL DEFAULT false,
  -- 경기 방식 기본값
  default_match_format text,                   -- TOURNAMENT / LEAGUE / MEASURED / SCORED
  -- 종목별 시즌 예외 (NULL이면 core.season의 역년 사용)
  season_scope  text,
  sort_order    int NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ACTIVE',
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE sport.discipline (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id      uuid NOT NULL REFERENCES sport.sport(id) ON DELETE CASCADE,
  code          text NOT NULL,                 -- 'KYORUGI','POOMSAE' / '50M_FREE'
  name_i18n     jsonb NOT NULL,
  match_format  text,
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE(sport_id, code)
);

-- 부문: 성별 × 연령 × 체급 조합. 종목마다 완전히 다르므로 데이터로 관리.
CREATE TABLE sport.category (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id uuid NOT NULL REFERENCES sport.discipline(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name_i18n     jsonb NOT NULL,
  gender        text,                          -- M / F / MIXED
  age_min       int,
  age_max       int,
  weight_min    numeric(6,2),
  weight_max    numeric(6,2),
  team_size     int,                           -- NULL=개인전
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE(discipline_id, code)
);

-- ---------------------------------------------------------------------
-- 팀 (클럽·학교·훈련센터 소속 단위)
-- ---------------------------------------------------------------------
CREATE TABLE sport.team (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES core.organization(id),
  sport_id      uuid NOT NULL REFERENCES sport.sport(id),
  name_i18n     jsonb NOT NULL,
  short_name    text,
  logo_url      text,
  home_venue    text,
  founded_on    date,
  status        text NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sport.team(org_id, sport_id);

-- ---------------------------------------------------------------------
-- 경기인 등록 (연간 갱신)
-- 4개 유형: 선수 / 지도자 / 심판 / 선수관리담당자 (한국 g1 모델)
-- ---------------------------------------------------------------------
CREATE TABLE sport.registration (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  season_id     uuid NOT NULL REFERENCES core.season(id),
  sport_id      uuid NOT NULL REFERENCES sport.sport(id),
  reg_type      text NOT NULL,                 -- ATHLETE / COACH / REFEREE / MANAGER
  -- 소속 계층
  team_id       uuid REFERENCES sport.team(id),
  org_id        uuid NOT NULL REFERENCES core.organization(id),  -- 등록을 관장하는 협회
  -- 신청서(동적 폼)와 결재 인스턴스로 연결
  submission_id uuid REFERENCES core.form_submission(id),
  -- 선수 전용
  primary_discipline_id uuid REFERENCES sport.discipline(id),
  jersey_no     text,
  height_cm     numeric(5,1),
  weight_kg     numeric(5,1),
  -- 지도자/심판 전용
  license_grade text,
  license_no    text,
  license_expires_on date,
  -- 자격 게이트 (교육 이수 등)
  eligibility   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"antidoping":"2026-02-01","safeguarding":true}
  status        text NOT NULL DEFAULT 'DRAFT',       -- DRAFT/SUBMITTED/APPROVED/REJECTED/SUSPENDED/EXPIRED
  approved_at   timestamptz,
  card_issued_at timestamptz,                  -- 디지털 회원증 발급
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(person_id, season_id, sport_id, reg_type)   -- 이중 등록 차단
);
CREATE INDEX ON sport.registration(org_id, season_id, status);
CREATE INDEX ON sport.registration(sport_id, reg_type, status);
CREATE INDEX ON sport.registration(person_id);

-- 소속 변경 이력: 이적과 행정구역 개편을 구분해서 기록
CREATE TABLE sport.affiliation_change (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  sport_id      uuid NOT NULL REFERENCES sport.sport(id),
  from_team_id  uuid REFERENCES sport.team(id),
  to_team_id    uuid REFERENCES sport.team(id),
  from_org_id   uuid REFERENCES core.organization(id),
  to_org_id     uuid REFERENCES core.organization(id),
  change_type   text NOT NULL,                 -- TRANSFER / ADMIN_REORG / LOAN / RETIRE
  reason        text,
  submission_id uuid REFERENCES core.form_submission(id),
  effective_on  date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sport.affiliation_change(person_id, effective_on);

-- ---------------------------------------------------------------------
-- 대회 · 행사
-- 개최 신청은 core.form_submission + workflow로 처리되고,
-- 승인되면 여기 event 레코드가 확정된다. (법정 10일 SLA는 form_definition.sla_days)
-- ---------------------------------------------------------------------
CREATE TABLE sport.venue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_i18n     jsonb NOT NULL,
  org_id        uuid REFERENCES core.organization(id),
  region_code   text,
  address       text,
  capacity      int,
  lat           numeric(10,7),
  lng           numeric(10,7),
  facilities    jsonb,
  status        text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE sport.event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE,
  name_i18n     jsonb NOT NULL,
  sport_id      uuid REFERENCES sport.sport(id),   -- NULL = 종합대회(전국체전 등)
  season_id     uuid NOT NULL REFERENCES core.season(id),
  -- 주최/주관
  host_org_id   uuid NOT NULL REFERENCES core.organization(id),
  organizer_org_id uuid REFERENCES core.organization(id),
  -- 승인
  approval_submission_id uuid REFERENCES core.form_submission(id),
  approval_status text NOT NULL DEFAULT 'DRAFT', -- DRAFT/SUBMITTED/APPROVED/REJECTED
  approved_at   timestamptz,
  decision_no   text,                          -- 개최 결정문 번호
  -- 분류
  event_level   text,                          -- NATIONAL / PROVINCIAL / CLUB / INTERNATIONAL
  event_type    text,                          -- CHAMPIONSHIP / LEAGUE / FESTIVAL / TRAINING
  is_ranked     boolean NOT NULL DEFAULT true, -- 승인대회 여부(기록 공식 인정)
  -- 일정·장소
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  venue_id      uuid REFERENCES sport.venue(id),
  venue_text    text,
  -- 참가 신청
  entry_opens_at  timestamptz,
  entry_closes_at timestamptz,
  entry_fee_rule_id uuid REFERENCES core.fee_rule(id),
  max_entries   int,
  -- 요강 및 공개
  regulation_doc_id uuid REFERENCES core.document(id),
  poster_url    text,
  is_public     boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'PLANNED', -- PLANNED/OPEN/ONGOING/FINISHED/CANCELLED
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sport.event(sport_id, starts_on);
CREATE INDEX ON sport.event(status, starts_on);
CREATE INDEX ON sport.event(host_org_id);

-- 대회에서 실제로 열리는 부문
CREATE TABLE sport.event_category (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES sport.event(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES sport.category(id),
  max_entries   int,
  UNIQUE(event_id, category_id)
);

-- 참가 신청 (개인/팀 모두 지원)
CREATE TABLE sport.event_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES sport.event(id) ON DELETE CASCADE,
  event_category_id uuid REFERENCES sport.event_category(id),
  entry_type    text NOT NULL DEFAULT 'INDIVIDUAL', -- INDIVIDUAL / TEAM
  person_id     uuid REFERENCES core.person(id),
  team_id       uuid REFERENCES sport.team(id),
  submitted_org_id uuid REFERENCES core.organization(id),
  registration_id uuid REFERENCES sport.registration(id),  -- 자격 검증 근거
  seed_no       int,
  bib_no        text,
  -- 자격 자동 검증 결과
  eligibility_check jsonb,                     -- {"registered":true,"antidoping":true,"suspended":false}
  payment_order_id uuid REFERENCES core.payment_order(id),
  status        text NOT NULL DEFAULT 'PENDING', -- PENDING/CONFIRMED/REJECTED/WITHDRAWN
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sport.event_entry(event_id, status);
CREATE INDEX ON sport.event_entry(person_id);

-- 경기
CREATE TABLE sport.match (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES sport.event(id) ON DELETE CASCADE,
  event_category_id uuid REFERENCES sport.event_category(id),
  round_name    text,                          -- '예선','8강','결승'
  match_no      text,
  scheduled_at  timestamptz,
  venue_id      uuid REFERENCES sport.venue(id),
  court_no      text,
  status        text NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED/LIVE/FINISHED/CANCELLED
  -- 오프라인 입력 후 동기화 지원 (체육관 인터넷 불안정)
  synced_at     timestamptz,
  device_ref    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sport.match(event_id, scheduled_at);

-- 경기 참가자 (개인전/단체전 공통)
CREATE TABLE sport.match_participant (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES sport.match(id) ON DELETE CASCADE,
  entry_id      uuid REFERENCES sport.event_entry(id),
  side          text,                          -- HOME/AWAY/A/B, 기록경기는 lane
  lane_no       int,
  score         numeric(12,3),
  result        text,                          -- WIN/LOSE/DRAW/DQ/DNS/DNF
  rank_in_match int
);
CREATE INDEX ON sport.match_participant(match_id);
CREATE INDEX ON sport.match_participant(entry_id);

-- 최종 성적 (메달·순위) — 공개 페이지와 선수 프로필의 원천
CREATE TABLE sport.event_result (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES sport.event(id) ON DELETE CASCADE,
  event_category_id uuid REFERENCES sport.event_category(id),
  entry_id      uuid REFERENCES sport.event_entry(id),
  person_id     uuid REFERENCES core.person(id),
  team_id       uuid REFERENCES sport.team(id),
  org_id        uuid REFERENCES core.organization(id),
  final_rank    int,
  medal         text,                          -- GOLD/SILVER/BRONZE
  record_value  numeric(12,3),
  record_unit   text,                          -- 's','m','kg','points'
  is_record     boolean NOT NULL DEFAULT false,
  record_scope  text,                          -- NATIONAL / PROVINCIAL / EVENT
  record_certified_at timestamptz,
  points        numeric(10,3),                 -- 랭킹 포인트
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sport.event_result(person_id);
CREATE INDEX ON sport.event_result(event_id, final_rank);
CREATE INDEX ON sport.event_result(org_id, medal);

-- 랭킹 (종목별 산정 규칙이 다르므로 규칙도 데이터)
CREATE TABLE sport.ranking_rule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id      uuid NOT NULL REFERENCES sport.sport(id),
  name_i18n     jsonb NOT NULL,
  formula       jsonb NOT NULL,                -- {"by":"points","decay_months":12,"best_n":5}
  valid_from    date,
  valid_to      date
);

CREATE TABLE sport.ranking_snapshot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid NOT NULL REFERENCES sport.ranking_rule(id),
  category_id   uuid REFERENCES sport.category(id),
  person_id     uuid REFERENCES core.person(id),
  team_id       uuid REFERENCES sport.team(id),
  rank          int NOT NULL,
  points        numeric(12,3) NOT NULL,
  computed_on   date NOT NULL,
  UNIQUE(rule_id, category_id, person_id, team_id, computed_on)
);
CREATE INDEX ON sport.ranking_snapshot(rule_id, computed_on, rank);
