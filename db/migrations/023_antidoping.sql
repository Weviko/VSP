-- ============================================================================
-- 023. 도핑방지 (antidoping)
--
-- 한국도핑방지위원회(KADA)/WADA Code 체계를 벤치마크. 검사 → 분석(A/B) → AAF 판정 →
-- 제재(위반이력), 그리고 도핑방지 교육 이수를 전자화한다.
--
-- 두 개의 교차모듈 훅:
--   · 제재 확정(SUSPENSION) → sport.registration.status='SUSPENDED' → checkEligibility 출전 차단
--     (공정·윤리 신고의 recordMeasure 와 같은 단일 '출전차단' 훅을 공유)
--   · 교육 이수 → sport.registration.eligibility.antidoping 채움 → checkEligibility requireEducation 게이트 충족
--
-- 시료코드는 원본을 저장하지 않고 해시만 둔다(재식별 방지). TUE·검사배분계획(TDP)은 후속.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS antidoping;

-- ── 검사 + 분석결과 ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS antidoping.test (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES core.person(id),
  sport_id         uuid REFERENCES sport.sport(id),
  event_id         uuid REFERENCES sport.event(id),
  test_type        text NOT NULL DEFAULT 'OUT_OF_COMPETITION'
                     CHECK (test_type IN ('IN_COMPETITION','OUT_OF_COMPETITION')),
  sample_type      text NOT NULL DEFAULT 'URINE' CHECK (sample_type IN ('URINE','BLOOD')),
  sample_code_hash text,                                   -- sha256(시료코드), 원본 미저장
  collected_at     timestamptz NOT NULL DEFAULT now(),
  collector_org_id uuid REFERENCES core.organization(id),
  a_result         text CHECK (a_result IN ('NEG','POS')),
  b_result         text CHECK (b_result IN ('NEG','POS')),
  outcome          text NOT NULL DEFAULT 'PENDING' CHECK (outcome IN ('PENDING','NEGATIVE','AAF')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_test_person ON antidoping.test(person_id);
CREATE INDEX IF NOT EXISTS idx_ad_test_outcome ON antidoping.test(outcome);

-- ── 제재(위반이력) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS antidoping.sanction (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES core.person(id),
  registration_id  uuid REFERENCES sport.registration(id),
  test_id          uuid REFERENCES antidoping.test(id),
  adrv_article     text,                                    -- WADA Code 위반 조항
  sanction_type    text NOT NULL DEFAULT 'SUSPENSION'
                     CHECK (sanction_type IN ('SUSPENSION','WARNING','DQ')),
  starts_on        date,
  ends_on          date,
  decision_no      text,
  is_public        boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','SERVED','APPEALED','ANNULLED')),
  reflected_to_registration boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_sanction_person ON antidoping.sanction(person_id);

-- ── 교육 과정 + 이수 기록 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS antidoping.education_course (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE,
  name_i18n       jsonb NOT NULL,
  sport_id        uuid REFERENCES sport.sport(id),
  validity_months int NOT NULL DEFAULT 12,
  is_mandatory    boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS antidoping.education_record (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       uuid NOT NULL REFERENCES antidoping.education_course(id),
  person_id       uuid NOT NULL REFERENCES core.person(id),
  registration_id uuid REFERENCES sport.registration(id),
  completed_on    date NOT NULL DEFAULT CURRENT_DATE,
  expires_on      date,
  score           int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, person_id, completed_on)
);
CREATE INDEX IF NOT EXISTS idx_ad_edu_person ON antidoping.education_record(person_id);
