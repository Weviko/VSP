-- ============================================================================
-- 008. AI 문서 등록 (ingestion)
--
-- 서류(PDF·스캔·사진)가 올라오면 AI 가 읽어 베트남 체육회 공식 폼(form_definition)의
-- 항목으로 채운다. 그 결과를 여기 기록하고, 사람이 검토·승인(전자결재)한다.
--
-- 원칙: AI 는 초안을 채울 뿐 최종 결정을 하지 않는다.
--   - 추출 결과는 항목별 신뢰도와 함께 남긴다(감사 대상).
--   - 어떤 서식이 오든 붙도록 form_definition 을 대상으로 한다(서식에 코드로 묶지 않음).
--   - 원본 첨부는 attachment 로 보관하고, 이 작업이 그것을 가리킨다.
-- ============================================================================

CREATE TABLE core.ingestion_job (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES core.attachment(id),   -- 올라온 원본 서류
  form_id       uuid NOT NULL REFERENCES core.form_definition(id),  -- 등록 대상 공식 폼
  -- 등록 맥락 (누가·어느 조직·무엇에 대한 신청인가)
  subject_type  text,                          -- PERSON / ORG / EVENT
  submitter_person_id uuid REFERENCES core.person(id),
  submitter_org_id    uuid REFERENCES core.organization(id),
  -- 추출 결과
  extractor     text,                          -- 사용한 추출기 이름 (LLM 어댑터명 등)
  extracted     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- field_key -> 값
  confidence    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- field_key -> 0.0~1.0
  overall_confidence numeric(4,3),             -- 전체 신뢰도 (검토 우선순위 정렬용)
  validation    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 추출값 검증 오류 목록
  -- 흐름
  status        text NOT NULL DEFAULT 'PENDING',
                -- PENDING(대기) / EXTRACTED(추출됨·검토대기) / APPLIED(제출·결재개시)
                -- / REJECTED(반려) / FAILED(추출실패)
  submission_id uuid REFERENCES core.form_submission(id),   -- 검토 확정 시 생성된 신청서
  error         text,                          -- 실패 사유
  created_by    uuid REFERENCES core.person(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON core.ingestion_job(status, created_at);
CREATE INDEX ON core.ingestion_job(form_id, status);
CREATE INDEX ON core.ingestion_job(submission_id);
