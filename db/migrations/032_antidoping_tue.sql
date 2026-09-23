-- ============================================================================
-- 032. 도핑방지 — 치료목적 사용면책 (TUE)
--
-- 금지약물을 치료 목적으로 사용해야 하는 선수의 사전 면책 신청·심의(WADA TUE).
-- 의료정보는 최소화한다(약물명·사유 요지·유효기간만). 승인 시 진위확인 가능한 증명서 발급.
-- TUE 는 민감 의료정보라 공개(pub)하지 않는다 — 진위확인은 코드 보유자만 /verify 로.
-- ============================================================================

CREATE TABLE IF NOT EXISTS antidoping.tue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES core.person(id),
  sport_id         uuid REFERENCES sport.sport(id),
  substance        text NOT NULL,
  reason           text,
  valid_from       date,
  valid_to         date,
  decision         text NOT NULL DEFAULT 'PENDING'
                     CHECK (decision IN ('PENDING','APPROVED','REJECTED')),
  decided_by       uuid REFERENCES core.person(id),
  decided_at       timestamptz,
  cert_document_id uuid,
  verify_code      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_tue_person ON antidoping.tue(person_id);
CREATE INDEX IF NOT EXISTS idx_ad_tue_decision ON antidoping.tue(decision);
