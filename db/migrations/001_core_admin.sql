-- =====================================================================
-- VSP 001: CORE-ADMIN (행정 코어)
-- 체육 도메인과 분리된 재사용 가능한 행정 기반.
-- 이 스키마는 문화·관광·교육 등 다른 행정 분야에도 그대로 쓸 수 있어야 한다.
-- =====================================================================
-- gen_random_uuid()는 PostgreSQL 13부터 코어 내장 함수다.
-- pgcrypto 확장을 요구하지 않는 편이 이식성에 유리하다
-- (NAS나 관리형 DB에서 확장 설치 권한이 없을 수 있다).
CREATE SCHEMA IF NOT EXISTS core;

-- ── 공통 규약 ────────────────────────────────────────────────────────
-- · PK는 UUID (외부 노출 안전, 병합/이관에 강함)
-- · 사람이 보는 번호는 display_id (체육회 체계 확정 시 일괄 재발급 가능)
-- · 다국어 텍스트는 JSONB {"vi":"...","en":"...","ko":"..."}
-- · 삭제는 deleted_at (물리 삭제 금지 — 감사 추적 유지)

-- ---------------------------------------------------------------------
-- 조직 계층: 무제한 깊이 트리
-- 2025년 베트남 행정구역 개편(63→34) 같은 변동을 흡수하기 위해 고정 단계를 두지 않는다.
-- ---------------------------------------------------------------------
CREATE TABLE core.org_level_type (
  code          text PRIMARY KEY,              -- 'MINISTRY','NOC','NATIONAL_FED','PROVINCE_FED','DISTRICT','CLUB','TEAM','ACADEMY'
  name_i18n     jsonb NOT NULL,
  sort_order    int  NOT NULL DEFAULT 0,
  description   text
);

CREATE TABLE core.organization (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      text UNIQUE,                 -- 표시용 코드 (예: FED-TKD)
  parent_id       uuid REFERENCES core.organization(id),
  level_type      text NOT NULL REFERENCES core.org_level_type(code),
  name_i18n       jsonb NOT NULL,              -- {"vi":"Liên đoàn Taekwondo Việt Nam", ...}
  short_name      text,
  logo_url        text,
  -- 법인 정보
  tax_code        text,
  established_at  date,
  address         text,
  phone           text,
  email           text,
  website         text,
  -- 행정구역 (개편 이력 추적용, 고정 코드 아님)
  region_code     text,
  legacy_region_codes text[],                  -- 2025 개편 전 구 지역코드 (과거 기록 검색용)
  -- 유효기간: 조직 통합/분할/폐지 이력
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  merged_into_id  uuid REFERENCES core.organization(id),  -- 통합된 경우 후속 조직
  -- 확장
  external_ids    jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {"fifa_id":"...","legacy_no":"..."}
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,     -- 협회별 설정(요금, 결재선 기본값 등)
  status          text NOT NULL DEFAULT 'ACTIVE',         -- ACTIVE / PENDING / SUSPENDED / CLOSED
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX ON core.organization(parent_id);
CREATE INDEX ON core.organization(level_type);
CREATE INDEX ON core.organization(status) WHERE deleted_at IS NULL;
CREATE INDEX ON core.organization USING gin(name_i18n);

-- 조직 트리 조회용 재귀 뷰 (하위 전체)
CREATE OR REPLACE FUNCTION core.org_descendants(root uuid)
RETURNS TABLE(id uuid, depth int) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE t AS (
    SELECT o.id, 0 AS depth FROM core.organization o WHERE o.id = root
    UNION ALL
    SELECT c.id, t.depth + 1 FROM core.organization c JOIN t ON c.parent_id = t.id
  ) SELECT * FROM t;
$$;

-- ---------------------------------------------------------------------
-- 사람 (통합 ID) — 선수·지도자·심판·임원·직원이 모두 하나의 레코드
-- 한 사람이 생애에 걸쳐 역할을 바꿔도 이력이 이어진다 (한국 g1 "내 생애주기" 모델)
-- ---------------------------------------------------------------------
CREATE TABLE core.person (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id      text UNIQUE,                 -- VSID. 체육회 체계 확정 시 재발급 가능
  -- 베트남식 성명 표기
  full_name       text NOT NULL,               -- Nguyễn Văn A (전체 표기가 기본)
  family_name     text,
  middle_name     text,
  given_name      text,
  name_latin      text,                        -- 국제대회용 로마자 (성조 제거)
  gender          text,                        -- M / F / X
  birth_date      date,
  nationality     text DEFAULT 'VN',
  photo_url       text,
  phone           text,
  email           text,
  address         text,
  -- 신원 확인 (원문 저장 금지, 해시만)
  id_doc_type     text,                        -- CCCD / PASSPORT / BIRTH_CERT
  id_doc_hash     text,                        -- 중복 등록 검증 전용 해시
  id_verified_at  timestamptz,
  id_verify_method text,                       -- VNEID / MANUAL / CCCD_SCAN
  -- 확장: 어떤 외부 ID 체계가 오든 흡수
  external_ids    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"cccd_masked":"...","fifa_id":"...","legacy":{"tkd":"..."}}
  status          text NOT NULL DEFAULT 'ACTIVE',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX ON core.person(id_doc_hash) WHERE id_doc_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ON core.person(full_name);
CREATE INDEX ON core.person(birth_date);

-- 로그인 계정 (사람과 1:N — 한 사람이 여러 조직 계정을 가질 수 있음)
CREATE TABLE core.account (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid REFERENCES core.person(id),
  login_id        text UNIQUE NOT NULL,        -- 베트남은 전화번호가 사실상 기본 ID
  password_hash   text,
  auth_provider   text NOT NULL DEFAULT 'LOCAL', -- LOCAL / VNEID / ZALO
  locale          text NOT NULL DEFAULT 'vi',
  last_login_at   timestamptz,
  status          text NOT NULL DEFAULT 'ACTIVE',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 권한: 사람 × 조직 × 역할
CREATE TABLE core.role (
  code          text PRIMARY KEY,   -- SYS_ADMIN / ORG_HEAD / ORG_STAFF / ORG_FINANCE / ORG_MEDIA / MEMBER
  name_i18n     jsonb NOT NULL,
  permissions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_admin      boolean NOT NULL DEFAULT false
);

CREATE TABLE core.org_member (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  org_id        uuid NOT NULL REFERENCES core.organization(id),
  role_code     text NOT NULL REFERENCES core.role(code),
  title         text,                          -- 직책 (회장, 사무국장 등)
  valid_from    date NOT NULL DEFAULT CURRENT_DATE,
  valid_to      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(person_id, org_id, role_code, valid_from)
);
CREATE INDEX ON core.org_member(org_id, role_code);
CREATE INDEX ON core.org_member(person_id);

-- 시즌 (역년 기본, 종목별 예외 허용)
CREATE TABLE core.season (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,                 -- '2026' 또는 '2026-27'
  name_i18n     jsonb NOT NULL,
  scope_type    text NOT NULL DEFAULT 'GLOBAL', -- GLOBAL / SPORT
  scope_ref_id  uuid,                          -- SPORT일 때 sport.id
  starts_on     date NOT NULL,
  ends_on       date NOT NULL,
  is_current    boolean NOT NULL DEFAULT false,
  UNIQUE(code, scope_type, scope_ref_id)
);

-- =====================================================================
-- 동적 폼 엔진 (Form Schema Engine)
-- 목적: 체육회에서 받을 공식 서식이 어떤 모양이든, 코드 수정 없이 수용한다.
-- 신청서 항목이 바뀌면 관리자 화면에서 필드를 추가/수정하면 끝난다.
-- =====================================================================
CREATE TABLE core.form_definition (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,                 -- 'ATHLETE_REG','EVENT_APPLY','BUDGET_PLAN','SETTLEMENT'
  version       int  NOT NULL DEFAULT 1,
  org_id        uuid REFERENCES core.organization(id),  -- NULL = 전국 표준 서식
  sport_id      uuid,                                    -- NULL = 전 종목 공통
  title_i18n    jsonb NOT NULL,
  description_i18n jsonb,
  -- 법정 근거 (베트남 행정절차와 연결)
  legal_basis   text,                          -- 예: 'Luật TDTT Điều 39'
  sla_days      int,                           -- 법정 처리기한 (대회승인 = 10일)
  layout        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 섹션/열 배치
  status        text NOT NULL DEFAULT 'DRAFT', -- DRAFT / ACTIVE / ARCHIVED
  effective_from date,
  effective_to   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, version, org_id, sport_id)
);

CREATE TABLE core.form_field (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES core.form_definition(id) ON DELETE CASCADE,
  field_key     text NOT NULL,                 -- 저장 키
  label_i18n    jsonb NOT NULL,
  help_i18n     jsonb,
  data_type     text NOT NULL,                 -- text/number/date/select/multiselect/file/person/org/table
  is_required   boolean NOT NULL DEFAULT false,
  -- 선택지 / 검증 / 조건부 표시를 전부 데이터로
  options       jsonb,                         -- [{"value":"M","label_i18n":{...}}]
  validation    jsonb,                         -- {"min":0,"max":150,"regex":"..."}
  visible_when  jsonb,                         -- {"field":"has_team","eq":true}
  default_value jsonb,
  -- 기존 컬럼과 매핑 (예: person.birth_date를 자동 채움)
  bind_to       text,
  section       text,
  sort_order    int NOT NULL DEFAULT 0,
  UNIQUE(form_id, field_key)
);
CREATE INDEX ON core.form_field(form_id, sort_order);

-- 제출된 신청서 (모든 업무 신청의 공통 저장소)
CREATE TABLE core.form_submission (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES core.form_definition(id),
  doc_no        text UNIQUE,                   -- 문서번호 (베트남 공문 체계 số/ký hiệu)
  subject_type  text,                          -- 신청 대상 유형: PERSON / ORG / EVENT
  subject_id    uuid,
  submitter_person_id uuid REFERENCES core.person(id),
  submitter_org_id    uuid REFERENCES core.organization(id),
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- field_key -> value
  status        text NOT NULL DEFAULT 'DRAFT', -- DRAFT/SUBMITTED/IN_REVIEW/APPROVED/REJECTED/WITHDRAWN
  submitted_at  timestamptz,
  decided_at    timestamptz,
  due_at        timestamptz,                   -- SLA 마감 (법정 기한 자동 계산)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.form_submission(status, due_at);
CREATE INDEX ON core.form_submission(submitter_org_id);
CREATE INDEX ON core.form_submission USING gin(data);

-- =====================================================================
-- 워크플로 엔진 (전자결재)
-- 목적: 결재선이 2단계든 5단계든, 병렬이든 순차든 코드 수정 없이 설정한다.
-- =====================================================================
CREATE TABLE core.workflow_definition (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL,
  version       int NOT NULL DEFAULT 1,
  name_i18n     jsonb NOT NULL,
  applies_to_form text,                        -- form_definition.code
  org_id        uuid REFERENCES core.organization(id),  -- NULL = 표준 결재선
  status        text NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, version, org_id)
);

CREATE TABLE core.workflow_step (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid NOT NULL REFERENCES core.workflow_definition(id) ON DELETE CASCADE,
  step_no       int NOT NULL,
  name_i18n     jsonb NOT NULL,
  -- 누가 승인하는가: 역할 기반 (사람 지정이 아니라 역할 → 인사이동에 강함)
  approver_type text NOT NULL,                 -- ROLE_IN_ORG / ROLE_IN_PARENT_ORG / SPECIFIC_ORG / SUBMITTER_ORG_HEAD
  approver_role text REFERENCES core.role(code),
  approver_org_id uuid REFERENCES core.organization(id),
  mode          text NOT NULL DEFAULT 'SEQUENTIAL', -- SEQUENTIAL / PARALLEL_ALL / PARALLEL_ANY
  -- 조건부 단계 (예: 금액 1억동 이상일 때만 상급 승인)
  condition     jsonb,
  sla_hours     int,
  can_delegate  boolean NOT NULL DEFAULT true,  -- 위임전결 허용
  is_final      boolean NOT NULL DEFAULT false,
  UNIQUE(workflow_id, step_no)
);

CREATE TABLE core.workflow_instance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid NOT NULL REFERENCES core.workflow_definition(id),
  submission_id uuid NOT NULL REFERENCES core.form_submission(id) ON DELETE CASCADE,
  current_step  int NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'RUNNING', -- RUNNING/APPROVED/REJECTED/CANCELLED
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX ON core.workflow_instance(status, current_step);

CREATE TABLE core.workflow_action (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   uuid NOT NULL REFERENCES core.workflow_instance(id) ON DELETE CASCADE,
  step_no       int NOT NULL,
  actor_person_id uuid REFERENCES core.person(id),
  actor_org_id  uuid REFERENCES core.organization(id),
  action        text NOT NULL,                 -- APPROVE/REJECT/RETURN/DELEGATE/COMMENT
  comment       text,
  -- 전자서명 (VNPAY-CA 등 CA 연동 시 채움 → 종이 직인 대체)
  signature_ref text,
  signed_at     timestamptz,
  acted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.workflow_action(instance_id, step_no);

-- =====================================================================
-- 문서 · 첨부
-- =====================================================================
CREATE TABLE core.attachment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    text NOT NULL,                 -- SUBMISSION / PERSON / ORG / EVENT / PAYMENT
  owner_id      uuid NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  storage_key   text NOT NULL,                 -- S3 호환 키 (MinIO/NAS/클라우드 동일)
  checksum      text,
  ocr_text      text,                          -- 종이 서류 스캔 시 전문검색용
  uploaded_by   uuid REFERENCES core.person(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX ON core.attachment(owner_type, owner_id);

-- 공식 문서(발신/수신 공문). 결재 완료된 submission이 문서로 확정된다.
CREATE TABLE core.document (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no        text UNIQUE NOT NULL,
  submission_id uuid REFERENCES core.form_submission(id),
  from_org_id   uuid REFERENCES core.organization(id),
  to_org_id     uuid REFERENCES core.organization(id),
  title         text NOT NULL,
  body          text,
  doc_type      text,                          -- OFFICIAL_LETTER / DECISION / REPORT / PLAN
  confidentiality text NOT NULL DEFAULT 'INTERNAL', -- PUBLIC / INTERNAL / CONFIDENTIAL
  retention_years int NOT NULL DEFAULT 5,
  pdf_key       text,                          -- 출력본 (QR 진위확인 포함)
  verify_code   text UNIQUE,                   -- 공개 진위확인 코드
  issued_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 결제 (PAY) — 자금은 PG를 통해 협회 계좌로 직접. 우리 계좌를 거치지 않는다.
-- (Nghị định 52/2024 결제중개업 라이선스 회피 구조)
-- =====================================================================
CREATE TABLE core.fee_rule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES core.organization(id),
  code          text NOT NULL,                 -- ATHLETE_REG / EVENT_ENTRY / MEMBERSHIP
  name_i18n     jsonb NOT NULL,
  amount        numeric(14,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'VND',
  -- 조건부 요금 (연령/등급/단체할인)
  conditions    jsonb,
  season_id     uuid REFERENCES core.season(id),
  valid_from    date,
  valid_to      date
);

CREATE TABLE core.payment_order (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no      text UNIQUE NOT NULL,
  payer_person_id uuid REFERENCES core.person(id),
  payer_org_id  uuid REFERENCES core.organization(id),
  -- 수취 조직 = PG 가맹점. 돈이 여기로 직접 간다.
  payee_org_id  uuid NOT NULL REFERENCES core.organization(id),
  ref_type      text,                          -- REGISTRATION / EVENT_ENTRY / MEMBERSHIP
  ref_id        uuid,
  amount        numeric(14,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'VND',
  method        text,                          -- VNPAY_QR / MOMO / ZALOPAY / BANK / CASH
  status        text NOT NULL DEFAULT 'PENDING', -- PENDING/PAID/FAILED/REFUNDED/CANCELLED
  -- 현금 수납(오프라인) 대리 입력 지원
  is_offline    boolean NOT NULL DEFAULT false,
  recorded_by   uuid REFERENCES core.person(id),
  pg_txn_ref    text,
  invoice_no    text,                          -- 전자세금계산서 번호
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.payment_order(payee_org_id, status);
CREATE INDEX ON core.payment_order(ref_type, ref_id);

-- 협회 회계 원장: 재원(fund_source)별 구분 회계 — 1일차부터 필수
CREATE TABLE core.ledger_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES core.organization(id),
  season_id     uuid REFERENCES core.season(id),
  fund_source   text NOT NULL,                 -- STATE_BUDGET / PROVINCE / SELF / SPONSOR / MEMBERSHIP
  account_code  text,
  direction     text NOT NULL,                 -- IN / OUT
  amount        numeric(14,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'VND',
  occurred_on   date NOT NULL,
  description   text,
  ref_type      text,
  ref_id        uuid,
  submission_id uuid REFERENCES core.form_submission(id),  -- 집행 품의와 연결
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.ledger_entry(org_id, season_id, fund_source);

-- =====================================================================
-- 알림 · 동의 · 감사
-- =====================================================================
CREATE TABLE core.notification (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid REFERENCES core.person(id),
  channel       text NOT NULL,                 -- ZALO / SMS / PUSH / EMAIL / INAPP
  template_code text,
  payload       jsonb,
  status        text NOT NULL DEFAULT 'QUEUED',
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 개인정보보호령(Nghị định 13/2023) 대응: 동의 이력
CREATE TABLE core.consent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  consent_type  text NOT NULL,                 -- TERMS / PRIVACY / PORTRAIT / HEALTH_DATA / MARKETING
  version       text NOT NULL,
  granted       boolean NOT NULL,
  -- 미성년자 보호자 동의
  guardian_person_id uuid REFERENCES core.person(id),
  guardian_name text,
  ip_address    inet,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX ON core.consent(person_id, consent_type);

-- 감사 추적: 모든 변경의 불변 기록 (법적 증거력)
CREATE TABLE core.audit_log (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_person_id uuid,
  actor_org_id  uuid,
  actor_ip      inet,
  entity_schema text NOT NULL,
  entity_table  text NOT NULL,
  entity_id     uuid,
  action        text NOT NULL,                 -- INSERT / UPDATE / DELETE / APPROVE / LOGIN
  before_data   jsonb,
  after_data    jsonb,
  note          text
);
CREATE INDEX ON core.audit_log(entity_table, entity_id);
CREATE INDEX ON core.audit_log(occurred_at DESC);
CREATE INDEX ON core.audit_log(actor_person_id);
