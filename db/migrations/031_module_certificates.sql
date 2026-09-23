-- ============================================================================
-- 031. 모듈 증명서 연동 (도핑 교육 이수증 · 국가대표 확인서)
--
-- 각 기록에 발급된 증명서(core.document)와 진위확인 코드를 연결한다.
-- 지도자 자격증(coach.credential)은 027 에서 이미 cert_document_id/verify_code 보유.
-- 진위확인은 기존 pub.verify_certificate(007/016) 를 그대로 쓴다.
-- ============================================================================

ALTER TABLE antidoping.education_record ADD COLUMN IF NOT EXISTS cert_document_id uuid;
ALTER TABLE antidoping.education_record ADD COLUMN IF NOT EXISTS verify_code text;

ALTER TABLE sport.nt_member ADD COLUMN IF NOT EXISTS cert_document_id uuid;
ALTER TABLE sport.nt_member ADD COLUMN IF NOT EXISTS verify_code text;
