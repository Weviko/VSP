-- 016 증명서·공문 취소(무효화)
-- 잘못 발급된 증명서를 되돌린다(정부 감사·분쟁 대비). 지우지 않고 revoked_at 를 찍어 이력을 남긴다.
-- 공개 진위확인(pub.verify_certificate)은 '취소됨'을 그대로 노출한다 —
--   취소된 코드를 "없음"으로 감추면, 위조 여부를 확인하려는 사람이 오히려 오해한다.
-- 공개 규칙의 본체는 007 이며, 여기서는 그 함수에 revoked 플래그만 더한다.

ALTER TABLE core.document ADD COLUMN IF NOT EXISTS revoked_at    timestamptz;
ALTER TABLE core.document ADD COLUMN IF NOT EXISTS revoke_reason text;

-- 반환 컬럼이 늘어나므로 DROP 후 재생성한다(CREATE OR REPLACE 는 반환 타입 변경 불가).
DROP FUNCTION IF EXISTS pub.verify_certificate(text);
CREATE FUNCTION pub.verify_certificate(p_code text)
RETURNS TABLE (doc_no text, title text, issued_at timestamptz, org_name jsonb, subject_name text, revoked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.doc_no, d.title, d.issued_at, o.name_i18n,
         (SELECT p.full_name FROM core.attachment a
            JOIN core.person p ON ('person:' || p.id) = a.storage_key
           WHERE a.owner_type = 'DOCUMENT' AND a.owner_id = d.id
           LIMIT 1),
         (d.revoked_at IS NOT NULL)
    FROM core.document d
    LEFT JOIN core.organization o ON o.id = d.from_org_id
   WHERE d.verify_code = upper(trim(p_code))
     AND d.issued_at IS NOT NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION pub.verify_certificate(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT EXECUTE ON FUNCTION pub.verify_certificate(text) TO vsp_portal;
  END IF;
END $$;
