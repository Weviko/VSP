-- =====================================================================
-- VSP 006: 보조금 전 주기 (부처 레벨)
--
-- 한국 e나라도움의 흐름을 옮긴다:
--   공모등록 → 신청 → 선정 → 사업등록(계좌·집행계획)
--   → 교부신청 → 교부결정 → 집행관리 → 정산 → 검사 → 정보공시
--
-- 핵심 두 가지:
--   1) 중앙 → 지방 → 단체 → 최종 집행까지 계층으로 추적한다 (parent_award_id)
--   2) 재원(국가/지방/자부담/후원)을 처음부터 구분한다. 나중에 붙이면 마이그레이션이 지옥이 된다.
--
-- 스키마 이름이 grant_mgmt 인 이유: GRANT 는 PostgreSQL 예약어다.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS grant_mgmt;

-- ---------------------------------------------------------------------
-- 사업(공모)
-- 부처나 상위 기관이 등록한다. 공모형과 지정형 둘 다 지원한다.
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.program (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE,
  name_i18n       jsonb NOT NULL,
  description_i18n jsonb,
  owner_org_id    uuid NOT NULL REFERENCES core.organization(id),  -- 공모 주관 기관
  season_id       uuid REFERENCES core.season(id),
  fiscal_year     int NOT NULL,
  program_type    text NOT NULL DEFAULT 'OPEN_CALL',   -- OPEN_CALL(공모) / DESIGNATED(지정)
  -- 예산
  total_budget    numeric(16,2),
  currency        text NOT NULL DEFAULT 'VND',
  -- 신청 기간
  applies_from    date,
  applies_to      date,
  -- 신청 서식 (동적 폼 재사용)
  application_form_code text,
  -- 외부 시스템 연계 (베트남에 국가 보조금 시스템이 있을 경우)
  external_system text,
  external_program_no text,
  status          text NOT NULL DEFAULT 'DRAFT',       -- DRAFT/OPEN/CLOSED/AWARDED/FINISHED
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON grant_mgmt.program(owner_org_id, fiscal_year);
CREATE INDEX ON grant_mgmt.program(status, applies_to);

-- ---------------------------------------------------------------------
-- 신청
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.application (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      uuid NOT NULL REFERENCES grant_mgmt.program(id) ON DELETE CASCADE,
  applicant_org_id uuid NOT NULL REFERENCES core.organization(id),
  submission_id   uuid REFERENCES core.form_submission(id),   -- 신청서(동적 폼)
  requested_amount numeric(16,2) NOT NULL DEFAULT 0,
  self_funding    numeric(16,2) NOT NULL DEFAULT 0,           -- 자부담
  summary         text,
  -- 심사
  score           numeric(6,2),
  rank_no         int,
  review_note     text,
  status          text NOT NULL DEFAULT 'SUBMITTED',  -- SUBMITTED/UNDER_REVIEW/SELECTED/REJECTED/WITHDRAWN
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  UNIQUE(program_id, applicant_org_id)
);
CREATE INDEX ON grant_mgmt.application(program_id, status);
CREATE INDEX ON grant_mgmt.application(applicant_org_id);

-- ---------------------------------------------------------------------
-- 교부 결정
-- parent_award_id 로 중앙 → 지방 → 단체 계층을 추적한다.
-- 한 기관이 받은 보조금을 하위 기관에 재교부하는 구조를 표현한다.
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.award (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      uuid NOT NULL REFERENCES grant_mgmt.program(id),
  application_id  uuid REFERENCES grant_mgmt.application(id),
  parent_award_id uuid REFERENCES grant_mgmt.award(id),        -- 상위 교부건 (재교부)
  grantee_org_id  uuid NOT NULL REFERENCES core.organization(id),
  decision_no     text,                                        -- 교부 결정문 번호
  decision_doc_id uuid REFERENCES core.document(id),
  awarded_amount  numeric(16,2) NOT NULL,
  self_funding    numeric(16,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'VND',
  -- 보조금법상 전용 계좌 의무 대응
  dedicated_account text,
  bank_name       text,
  -- 사업 기간
  starts_on       date,
  ends_on         date,
  -- 정산 기한
  settlement_due_on date,
  conditions      text,
  status          text NOT NULL DEFAULT 'DECIDED',  -- DECIDED/PAID/EXECUTING/SETTLING/CLOSED/CANCELLED
  decided_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  closed_at       timestamptz
);
CREATE INDEX ON grant_mgmt.award(grantee_org_id, status);
CREATE INDEX ON grant_mgmt.award(program_id);
CREATE INDEX ON grant_mgmt.award(parent_award_id);
CREATE INDEX ON grant_mgmt.award(settlement_due_on) WHERE status <> 'CLOSED';

-- 교부 계층 조회 (상위 교부건에서 하위 전체를 찾는다)
CREATE OR REPLACE FUNCTION grant_mgmt.award_descendants(root uuid)
RETURNS TABLE(id uuid, depth int) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE t AS (
    SELECT a.id, 0 AS depth FROM grant_mgmt.award a WHERE a.id = root
    UNION ALL
    SELECT c.id, t.depth + 1 FROM grant_mgmt.award c JOIN t ON c.parent_award_id = t.id
  ) SELECT * FROM t;
$$;

-- ---------------------------------------------------------------------
-- 집행 계획 (내역사업 = 예산 세목)
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.budget_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id        uuid NOT NULL REFERENCES grant_mgmt.award(id) ON DELETE CASCADE,
  code            text,
  name_i18n       jsonb NOT NULL,
  -- 재원 구분: 나중에 붙이면 마이그레이션 지옥이 되므로 처음부터 둔다
  fund_source     text NOT NULL DEFAULT 'STATE_BUDGET',  -- STATE_BUDGET/PROVINCE/SELF/SPONSOR/MEMBERSHIP
  planned_amount  numeric(16,2) NOT NULL DEFAULT 0,
  sort_order      int NOT NULL DEFAULT 0
);
CREATE INDEX ON grant_mgmt.budget_item(award_id);

-- ---------------------------------------------------------------------
-- 집행 내역
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.execution (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id        uuid NOT NULL REFERENCES grant_mgmt.award(id) ON DELETE CASCADE,
  budget_item_id  uuid REFERENCES grant_mgmt.budget_item(id),
  executed_on     date NOT NULL,
  amount          numeric(16,2) NOT NULL,
  fund_source     text NOT NULL DEFAULT 'STATE_BUDGET',
  payee           text,
  description     text,
  -- 증빙. 같은 증빙을 두 사업에 쓰는 중복 수급을 잡기 위해 해시를 둔다
  evidence_no     text,
  evidence_hash   text,
  attachment_id   uuid REFERENCES core.attachment(id),
  recorded_by     uuid REFERENCES core.person(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON grant_mgmt.execution(award_id, executed_on);
CREATE INDEX ON grant_mgmt.execution(evidence_hash) WHERE evidence_hash IS NOT NULL;

-- ---------------------------------------------------------------------
-- 정산 · 검사
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.settlement (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id        uuid NOT NULL REFERENCES grant_mgmt.award(id) ON DELETE CASCADE,
  submission_id   uuid REFERENCES core.form_submission(id),  -- 정산보고서
  reported_amount numeric(16,2) NOT NULL DEFAULT 0,
  executed_amount numeric(16,2) NOT NULL DEFAULT 0,
  remaining_amount numeric(16,2) NOT NULL DEFAULT 0,
  -- 잔액 처리
  returned_amount numeric(16,2) NOT NULL DEFAULT 0,
  carried_over_amount numeric(16,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'DRAFT',  -- DRAFT/SUBMITTED/INSPECTING/APPROVED/REJECTED
  submitted_at    timestamptz,
  approved_at     timestamptz,
  UNIQUE(award_id)
);

CREATE TABLE grant_mgmt.inspection (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id   uuid NOT NULL REFERENCES grant_mgmt.settlement(id) ON DELETE CASCADE,
  inspector_org_id uuid REFERENCES core.organization(id),
  inspector_person_id uuid REFERENCES core.person(id),
  result          text NOT NULL,                 -- PASS / CONDITIONAL / FAIL
  findings        text,
  -- 부정수급 적발 시
  recovery_amount numeric(16,2) NOT NULL DEFAULT 0,
  recovered_at    timestamptz,
  inspected_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON grant_mgmt.inspection(settlement_id);

-- ---------------------------------------------------------------------
-- 정보 공시 (대외 공개)
-- ---------------------------------------------------------------------
CREATE TABLE grant_mgmt.disclosure (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id        uuid NOT NULL REFERENCES grant_mgmt.award(id) ON DELETE CASCADE,
  fiscal_year     int NOT NULL,
  published_at    timestamptz NOT NULL DEFAULT now(),
  summary         jsonb NOT NULL,                -- 공개용 요약 (금액·집행률·정산 결과)
  is_public       boolean NOT NULL DEFAULT true,
  UNIQUE(award_id)
);
CREATE INDEX ON grant_mgmt.disclosure(fiscal_year, is_public);
