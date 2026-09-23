-- ============================================================================
-- 025. 생활체육 클럽·동호인 (club)
--
-- 등록 생활체육 클럽(동호회) + 동호인 회원 + 생활체육 프로그램(강좌) + 수강.
-- 베트남 '전국민 체력단련(toàn dân rèn luyện thân thể)' 정책과 맞닿는다.
-- 경쟁용 sport.team·sport.registration 과 별개의 비경쟁 커뮤니티 단위.
-- 승인·활성 클럽과 모집 중 프로그램만 pub 로 공개해 '우리 동네 동호회 찾기'와 참여 통계를 만든다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sport.club (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid REFERENCES core.organization(id),   -- 관장 협회/성·시 체육국
  sport_id              uuid NOT NULL REFERENCES sport.sport(id),
  name_i18n             jsonb NOT NULL,
  short_name            text,
  region_code           text,
  club_type             text NOT NULL DEFAULT 'COMMUNITY'
                          CHECK (club_type IN ('COMMUNITY','PUBLIC','DESIGNATED')),
  venue_text            text,
  representative_person_id uuid REFERENCES core.person(id),
  founded_on            date,
  member_capacity       int,
  submission_id         uuid REFERENCES core.form_submission(id),
  status                text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','SUSPENDED','CLOSED')),
  approved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_region ON sport.club(region_code);
CREATE INDEX IF NOT EXISTS idx_club_status ON sport.club(status);

CREATE TABLE IF NOT EXISTS sport.club_member (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    uuid NOT NULL REFERENCES sport.club(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES core.person(id),
  member_no  text,
  role       text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER','LEADER','INSTRUCTOR')),
  joined_on  date NOT NULL DEFAULT CURRENT_DATE,
  left_on    date,
  status     text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_club_member_club ON sport.club_member(club_id);

CREATE TABLE IF NOT EXISTS sport.club_program (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid NOT NULL REFERENCES sport.club(id) ON DELETE CASCADE,
  sport_id         uuid REFERENCES sport.sport(id),
  name_i18n        jsonb NOT NULL,
  description_i18n  jsonb,
  category         text NOT NULL DEFAULT 'ALL' CHECK (category IN ('YOUTH','ADULT','SENIOR','PARA','ALL')),
  schedule_text    text,
  capacity         int,
  starts_on        date,
  ends_on          date,
  is_public        boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','CLOSED','FINISHED')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_program_club ON sport.club_program(club_id);

CREATE TABLE IF NOT EXISTS sport.club_program_enrollment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       uuid NOT NULL REFERENCES sport.club_program(id) ON DELETE CASCADE,
  club_member_id   uuid NOT NULL REFERENCES sport.club_member(id) ON DELETE CASCADE,
  enrolled_on      date NOT NULL DEFAULT CURRENT_DATE,
  status           text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING','CONFIRMED','CANCELLED')),
  payment_order_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, club_member_id)
);
CREATE INDEX IF NOT EXISTS idx_club_enroll_program ON sport.club_program_enrollment(program_id);
