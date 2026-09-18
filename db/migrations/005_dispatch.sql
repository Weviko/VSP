-- =====================================================================
-- VSP 005: 기관 간 공문 유통 (부처 레벨)
--
-- 지금까지의 결재는 "조직 내부"에서만 돌았다.
-- 부처가 쓰려면 문체부 → 체육회 → 협회로 공문이 내려가고 보고가 올라가는
-- 기관 "간" 경로가 필요하다. 한국의 온나라시스템이 담당하는 영역이다.
--
-- 온나라의 흐름을 따른다:
--   기안 → (타 기관·부서) 합의 → 결재 → 시행 → 상대 기관 접수 → 열람범위 지정
--
-- 베트남 정부에 이미 전자문서시스템이 있을 수 있으므로
-- 외부 연계 필드(external_*)를 두어 나중에 어댑터만 붙이면 되게 한다.
-- =====================================================================

-- 기존 문서에 부처 레벨 속성을 추가한다
ALTER TABLE core.document
  ADD COLUMN IF NOT EXISTS urgency        text NOT NULL DEFAULT 'NORMAL',  -- NORMAL / URGENT / MOST_URGENT
  ADD COLUMN IF NOT EXISTS doc_kind       text NOT NULL DEFAULT 'INTERNAL',-- INTERNAL / OUTGOING / INCOMING
  ADD COLUMN IF NOT EXISTS external_system text,     -- 연계된 외부 시스템 식별자
  ADD COLUMN IF NOT EXISTS external_doc_no text,     -- 외부 시스템의 문서번호
  ADD COLUMN IF NOT EXISTS registered_at  timestamptz;  -- 문서대장 등재 시각

CREATE INDEX IF NOT EXISTS document_kind_idx ON core.document(doc_kind, issued_at DESC);
CREATE INDEX IF NOT EXISTS document_external_idx ON core.document(external_system, external_doc_no);

-- ---------------------------------------------------------------------
-- 합의(협조)
-- 승인과 다르다. 결재 전에 관련 부서·기관의 동의를 받는 절차이며,
-- 반대 의견이 나와도 기안 기관이 최종 판단할 수 있다.
-- ---------------------------------------------------------------------
CREATE TABLE core.document_concurrence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES core.document(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES core.organization(id),
  role_code     text REFERENCES core.role(code),
  status        text NOT NULL DEFAULT 'REQUESTED',  -- REQUESTED / AGREED / DISAGREED / SKIPPED
  opinion       text,
  responded_by  uuid REFERENCES core.person(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  UNIQUE(document_id, org_id)
);
CREATE INDEX ON core.document_concurrence(org_id, status);

-- ---------------------------------------------------------------------
-- 시행·접수 (기관 간 송수신)
-- 한 건의 공문이 여러 기관에 동시에 나갈 수 있으므로 수신처를 행으로 둔다.
-- ---------------------------------------------------------------------
CREATE TABLE core.dispatch (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES core.document(id) ON DELETE CASCADE,
  from_org_id   uuid NOT NULL REFERENCES core.organization(id),
  to_org_id     uuid NOT NULL REFERENCES core.organization(id),
  -- 수신처 구분: 주 수신 / 참조(열람만)
  recipient_type text NOT NULL DEFAULT 'TO',        -- TO / CC
  status        text NOT NULL DEFAULT 'SENT',       -- SENT / RECEIVED / READ / RETURNED
  -- 접수 처리
  received_by   uuid REFERENCES core.person(id),
  receipt_no    text,                                -- 수신 기관의 접수번호
  -- 회신 요구
  reply_due_on  date,
  reply_doc_id  uuid REFERENCES core.document(id),  -- 회신 공문
  sent_at       timestamptz NOT NULL DEFAULT now(),
  received_at   timestamptz,
  read_at       timestamptz,
  UNIQUE(document_id, to_org_id)
);
CREATE INDEX ON core.dispatch(to_org_id, status, sent_at DESC);
CREATE INDEX ON core.dispatch(from_org_id, sent_at DESC);
CREATE INDEX ON core.dispatch(reply_due_on) WHERE reply_doc_id IS NULL;

-- ---------------------------------------------------------------------
-- 열람 범위
-- 접수한 기관이 "누구까지 이 공문을 볼 수 있는지" 지정한다.
-- 지정하지 않으면 접수 담당자만 본다.
-- ---------------------------------------------------------------------
CREATE TABLE core.document_access (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES core.document(id) ON DELETE CASCADE,
  org_id        uuid REFERENCES core.organization(id),
  person_id     uuid REFERENCES core.person(id),
  role_code     text REFERENCES core.role(code),
  granted_by    uuid REFERENCES core.person(id),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (org_id IS NOT NULL OR person_id IS NOT NULL OR role_code IS NOT NULL)
);
CREATE INDEX ON core.document_access(document_id);
CREATE INDEX ON core.document_access(person_id);

-- ---------------------------------------------------------------------
-- 문서 대장 (생산·접수)
-- 기관마다 연도별로 번호를 붙여 관리한다. 감사에서 가장 먼저 보는 자료다.
-- ---------------------------------------------------------------------
CREATE TABLE core.document_register (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES core.organization(id),
  document_id   uuid NOT NULL REFERENCES core.document(id) ON DELETE CASCADE,
  register_type text NOT NULL,                       -- PRODUCED / RECEIVED
  year          int  NOT NULL,
  seq           int  NOT NULL,
  register_no   text NOT NULL,                       -- 표시용 번호
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, register_type, year, seq)
);
CREATE INDEX ON core.document_register(org_id, year, register_type);
