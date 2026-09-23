-- ============================================================================
-- 021. 국가대표 선발·관리 (national team)
--
-- 종목별 상설 국가대표팀 + "소집(callup)" 단위(국제대회·평가전·훈련캠프)로
-- 후보 지명 → 자격 자동검증(checkEligibility) → 확정 명단 → 공개 대표명부.
-- 한국 대한체육회·KSPO 국가대표 관리(선발규정·소집·국제대회 엔트리)를 벤치마크.
--
-- 재사용: sport.registration·checkEligibility(자격 게이트), 전자결재(submission),
--   sport.event 개최 승인 패턴, pub.athlete(공개·미성년 보호), writeAudit.
-- 자격 스냅샷(eligibility_check)을 명단에 함께 저장해 "왜 뽑았나"를 설명할 수 있게 한다.
-- ============================================================================

-- ── 상설 국가대표팀 ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sport.national_team (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id            uuid NOT NULL REFERENCES sport.sport(id),
  discipline_id       uuid REFERENCES sport.discipline(id),
  governing_org_id    uuid REFERENCES core.organization(id),   -- 국가연맹
  gender              text NOT NULL DEFAULT 'MIXED' CHECK (gender IN ('M','F','MIXED')),
  age_class           text NOT NULL DEFAULT 'SENIOR' CHECK (age_class IN ('SENIOR','U23','U20','YOUTH')),
  head_coach_person_id uuid REFERENCES core.person(id),
  name_i18n           jsonb NOT NULL,
  status              text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nt_sport ON sport.national_team(sport_id);

-- ── 선발·소집 라운드 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sport.nt_callup (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_team_id              uuid NOT NULL REFERENCES sport.national_team(id) ON DELETE CASCADE,
  season_id                     uuid NOT NULL REFERENCES core.season(id),
  target_event_id               uuid REFERENCES sport.event(id),          -- 국내개최 국제대회
  target_competition_name_i18n  jsonb,                                     -- 외부 국제대회명
  callup_type                   text NOT NULL DEFAULT 'SELECTION'
                                  CHECK (callup_type IN ('SELECTION','CAMP','COMPETITION_ENTRY')),
  submission_id                 uuid REFERENCES core.form_submission(id),  -- 결재 연결
  approval_status               text NOT NULL DEFAULT 'DRAFT'
                                  CHECK (approval_status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  approved_at                   timestamptz,
  decision_no                   text,
  quota                         int,
  venue_text                    text,
  starts_on                     date,
  ends_on                       date,
  status                        text NOT NULL DEFAULT 'PLANNED'
                                  CHECK (status IN ('PLANNED','OPEN','FINALIZED','CANCELLED')),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nt_callup_team ON sport.nt_callup(national_team_id);

-- ── 후보·확정 명단 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sport.nt_member (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  callup_id          uuid NOT NULL REFERENCES sport.nt_callup(id) ON DELETE CASCADE,
  person_id          uuid NOT NULL REFERENCES core.person(id),
  registration_id    uuid REFERENCES sport.registration(id),     -- 자격 근거
  squad_role         text NOT NULL DEFAULT 'ATHLETE'
                       CHECK (squad_role IN ('ATHLETE','COACH','MANAGER','MEDICAL','RESERVE')),
  nomination_source  text NOT NULL DEFAULT 'DISCRETIONARY'
                       CHECK (nomination_source IN ('TRIAL','RANKING','DISCRETIONARY')),
  eval_score         numeric(6,2),
  rank_no            int,
  eligibility_check  jsonb,                                       -- checkEligibility 결과 스냅샷
  member_status      text NOT NULL DEFAULT 'NOMINATED'
                       CHECK (member_status IN ('NOMINATED','SELECTED','CONFIRMED','DECLINED','WITHDRAWN','REPLACED')),
  jersey_no          text,
  note               text,
  decided_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (callup_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_nt_member_callup ON sport.nt_member(callup_id);
