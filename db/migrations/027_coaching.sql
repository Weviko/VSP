-- ============================================================================
-- 027. 지도자 자격·연수 (coaching)
--
-- 현재 지도자는 sport.registration(reg_type='COACH')로 '연간 등록'만 되고 국가자격
-- 등급·유효기간·보수교육 갱신 개념이 없다(실제 갭). 이 모듈이 등급 체계·연수 과정·
-- 개인 자격(유효기간·갱신)을 얹는다. 보수교육 이수시간을 채우면 자격을 갱신한다.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS coach;

-- ── 자격 등급 카탈로그 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach.grade (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id                 uuid REFERENCES sport.sport(id),   -- NULL=전국 표준, 값=종목 오버라이드
  code                     text NOT NULL,
  name_i18n                jsonb NOT NULL,
  level_order              int NOT NULL DEFAULT 1,
  validity_years           int NOT NULL DEFAULT 4,
  refresher_hours_required int NOT NULL DEFAULT 0,
  prerequisite_grade_id    uuid REFERENCES coach.grade(id),
  status                   text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, sport_id)
);

-- ── 연수 과정 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach.course (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id     uuid REFERENCES coach.grade(id),
  sport_id     uuid REFERENCES sport.sport(id),
  code         text,
  name_i18n    jsonb NOT NULL,
  course_type  text NOT NULL DEFAULT 'REFRESHER' CHECK (course_type IN ('QUALIFICATION','REFRESHER')),
  hours        int NOT NULL DEFAULT 0,
  capacity     int,
  starts_on    date,
  ends_on      date,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','CLOSED','FINISHED')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_course_status ON coach.course(status);

-- ── 수강·이수 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach.course_enrollment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES coach.course(id) ON DELETE CASCADE,
  person_id    uuid NOT NULL REFERENCES core.person(id),
  status       text NOT NULL DEFAULT 'ENROLLED' CHECK (status IN ('ENROLLED','COMPLETED','FAILED','CANCELLED')),
  hours_earned int,
  score        int,
  completed_on date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_coach_enroll_course ON coach.course_enrollment(course_id);
CREATE INDEX IF NOT EXISTS idx_coach_enroll_person ON coach.course_enrollment(person_id);

-- ── 개인 자격(대장) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach.credential (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES core.person(id),
  grade_id         uuid NOT NULL REFERENCES coach.grade(id),
  sport_id         uuid REFERENCES sport.sport(id),
  obtained_on      date NOT NULL DEFAULT CURRENT_DATE,
  expires_on       date,
  last_renewed_on  date,
  status           text NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID','EXPIRED','SUSPENDED','REVOKED')),
  verify_code      text,
  cert_document_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_cred_person ON coach.credential(person_id);
CREATE INDEX IF NOT EXISTS idx_coach_cred_status ON coach.credential(status);
CREATE INDEX IF NOT EXISTS idx_coach_cred_expires ON coach.credential(expires_on);
