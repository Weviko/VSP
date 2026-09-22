-- ============================================================================
-- 019. 스포츠 공정·윤리 신고 (integrity)
--
-- 스포츠 폭력·성비위·경기 부정·비리를 익명으로도 접수하고,
-- 접수 → 선별 → 조사 → 결정 → 조치(징계) → 종결의 사건 워크플로로 처리한다.
-- 한국 스포츠윤리센터(문체부 산하 독립 신고·조사·피해자보호 기구)를 벤치마크.
--
-- 설계 원칙:
--   · 제보자·피해자·미성년 보호 — 신원은 integrity 스키마 안에만 두고 pub 에 절대 내보내지 않는다.
--   · 익명 접수 — reporter_person_id 가 NULL 일 수 있다. 접수번호는 해시만 저장(원문 미보관, 1회 표시).
--   · 조치(정지·자격박탈)는 sport.registration.status='SUSPENDED' 로 반영돼
--     기존 checkEligibility() 의 not_suspended 게이트에 자동으로 걸린다(출전 자동 차단).
--   · 모든 상태변경은 writeAudit 로 감사증거를 남긴다(정부 감사·분쟁 대비).
--
-- 대외 표기: category='MATCH_FIXING' 의 공개 라벨은 '경기 부정'으로만 하고
--   베팅·토토·배당 용어는 어디에도 쓰지 않는다(프로젝트 규칙).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS integrity;

-- ── 신고 사건 본체 (기밀) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrity.report (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no            text UNIQUE,                       -- RPT-YYYY-nnnnnn (접수 시 채번)
  category           text NOT NULL
                       CHECK (category IN ('VIOLENCE','SEXUAL','MATCH_FIXING','CORRUPTION','OTHER')),
  title              text NOT NULL,
  detail             text,                              -- 신고 본문(서술)
  is_anonymous       boolean NOT NULL DEFAULT false,
  reporter_person_id uuid REFERENCES core.person(id),   -- 익명이면 NULL
  reporter_contact   text,                              -- 회신용(업무 전용, pub 미노출)
  tracking_code_hash text,                              -- sha256(접수번호) hex, 원문 미저장
  sport_id           uuid REFERENCES sport.sport(id),
  respondent_org_id  uuid REFERENCES core.organization(id),
  respondent_name    text,                              -- 미등록 대상일 때 자유기재
  submission_id      uuid REFERENCES core.form_submission(id),  -- 동적폼 연결(후속)
  status             text NOT NULL DEFAULT 'RECEIVED'
                       CHECK (status IN ('RECEIVED','SCREENING','INVESTIGATING','DECIDED','CLOSED','DISMISSED')),
  severity           text CHECK (severity IN ('LOW','MED','HIGH')),
  assigned_org_id    uuid REFERENCES core.organization(id),
  assigned_person_id uuid REFERENCES core.person(id),
  is_minor_involved  boolean NOT NULL DEFAULT false,
  published          boolean NOT NULL DEFAULT false,    -- 종결 후 비식별 공개 여부
  public_summary_i18n jsonb,                            -- 공개용 비식별 요약
  received_at        timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz,
  closed_at          timestamptz
);
CREATE INDEX IF NOT EXISTS idx_integrity_report_status ON integrity.report(status);
CREATE INDEX IF NOT EXISTS idx_integrity_report_category ON integrity.report(category);
CREATE INDEX IF NOT EXISTS idx_integrity_report_tracking ON integrity.report(tracking_code_hash);

-- ── 사건 관계인 (신원 접근통제 대상, pub 절대 미노출) ─────────────────────
CREATE TABLE IF NOT EXISTS integrity.report_party (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES integrity.report(id) ON DELETE CASCADE,
  party_role text NOT NULL CHECK (party_role IN ('REPORTER','VICTIM','RESPONDENT','WITNESS')),
  person_id  uuid REFERENCES core.person(id),
  org_id     uuid REFERENCES core.organization(id),
  name_text  text,                                     -- 미등록자
  is_minor   boolean NOT NULL DEFAULT false,
  contact    text,                                     -- 업무 전용
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrity_party_report ON integrity.report_party(report_id);

-- ── 처리 타임라인 (사건일지) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrity.report_action (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES integrity.report(id) ON DELETE CASCADE,
  action          text NOT NULL
                    CHECK (action IN ('SCREEN','ASSIGN','REQUEST_INFO','INTERVIEW','DECIDE','NOTE','CLOSE')),
  actor_person_id uuid REFERENCES core.person(id),
  actor_org_id    uuid REFERENCES core.organization(id),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrity_action_report ON integrity.report_action(report_id, created_at);

-- ── 조치·징계 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrity.measure (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                uuid NOT NULL REFERENCES integrity.report(id) ON DELETE CASCADE,
  measure_type             text NOT NULL
                             CHECK (measure_type IN ('WARNING','SUSPENSION','BAN','EDU_ORDER','REFERRAL')),
  target_person_id         uuid REFERENCES core.person(id),
  target_org_id            uuid REFERENCES core.organization(id),
  decision_no              text,
  starts_on                date,
  ends_on                  date,
  reflected_to_registration boolean NOT NULL DEFAULT false,  -- 등록 자격에 반영됐는지
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integrity_measure_report ON integrity.measure(report_id);
