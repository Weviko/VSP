-- ============================================================================
-- 029. 경기 운영 심화 (심판 배정 · 현장 실시간 기록)
--
-- 기존 sport.event/match/match_participant 위에 (1) 경기별 심판·임원 배정,
-- (2) 현장 실시간 이벤트 로그(득점·반칙·교체·피리어드)와 러닝스코어(live_state)를 얹는다.
-- 오프라인 재전송 멱등을 위해 (match_id, client_seq) UNIQUE. 모든 배정·기록은 writeAudit.
-- 대진 추첨 기록·조편성 생성기·승자 자동진출은 후속(엔지니어링 심화).
-- ============================================================================

-- ── 심판·경기임원 배정 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sport.match_official (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES sport.match(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES core.person(id),
  registration_id uuid REFERENCES sport.registration(id),   -- REFEREE 자격 근거
  role            text NOT NULL DEFAULT 'REFEREE'
                    CHECK (role IN ('CHIEF_REFEREE','REFEREE','JUDGE','SCORER','TIMEKEEPER','COMMISSIONER')),
  status          text NOT NULL DEFAULT 'ASSIGNED'
                    CHECK (status IN ('ASSIGNED','CONFIRMED','DECLINED','REPLACED')),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  note            text,
  UNIQUE (match_id, person_id, role)
);
CREATE INDEX IF NOT EXISTS idx_match_official_match ON sport.match_official(match_id);
CREATE INDEX IF NOT EXISTS idx_match_official_person ON sport.match_official(person_id);

-- ── 실시간 경기 이벤트 로그 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sport.match_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES sport.match(id) ON DELETE CASCADE,
  client_seq  int,
  period      text,
  clock       text,
  side        text,
  kind        text NOT NULL
                CHECK (kind IN ('SCORE','FOUL','SUB','PERIOD_START','PERIOD_END','TIMEOUT','CARD','NOTE')),
  points      numeric(12,3),
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  entered_by  uuid REFERENCES core.person(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, client_seq)
);
CREATE INDEX IF NOT EXISTS idx_match_event_match ON sport.match_event(match_id, occurred_at);

-- 러닝스코어·현재 피리어드 (진행 중 표시용; 최종표는 box_score 유지)
ALTER TABLE sport.match ADD COLUMN IF NOT EXISTS live_state jsonb NOT NULL DEFAULT '{}'::jsonb;
