-- ============================================================================
-- 020. 공정·윤리 신고의 공개 계층 (pub)
--
-- 대외 웹은 두 가지만 본다:
--   1) pub.integrity_case — 종결·공개 처리된 사건의 '비식별 요약'만. 억지력 확보용.
--   2) pub.track_integrity_report(code) — 접수번호로 '진행 상태'만 조회(본문·관계인 미반환).
--
-- 신원(제보자·피해자·피신고자·미성년)은 integrity 스키마 안에만 있고 여기로 새지 않는다.
-- 공개 규칙은 007/이 파일의 pub 한 곳에만 둔다(화면에서 재구현 금지).
-- category 원값은 그대로 두되, 대외 라벨은 앱 i18n 이 '경기 부정' 등으로 일반화한다(베팅 용어 미사용).
-- ============================================================================

-- 종결·공개된 사건의 비식별 요약. 개인·조직·미성년 신원 전면 제외.
CREATE OR REPLACE VIEW pub.integrity_case AS
SELECT r.case_no,
       r.category,
       s.name_i18n AS sport_name,
       r.public_summary_i18n,
       r.decided_at,
       r.closed_at,
       (SELECT max(m.measure_type)
          FROM integrity.measure m
         WHERE m.report_id = r.id) AS measure_type
  FROM integrity.report r
  LEFT JOIN sport.sport s ON s.id = r.sport_id
 WHERE r.published = true
   AND r.status = 'CLOSED';
-- pub 스키마는 007 의 ALTER DEFAULT PRIVILEGES 로 새 뷰에 vsp_portal SELECT 가 자동 부여된다.

-- 접수번호(평문)로 진행 상태만 조회. 뷰로 두면 목록을 긁을 수 있으므로 함수로.
-- tracking_code_hash 는 sha256 hex 이며, 앱(Node crypto)과 동일하게 계산한다.
DROP FUNCTION IF EXISTS pub.track_integrity_report(text);
CREATE FUNCTION pub.track_integrity_report(p_code text)
RETURNS TABLE (case_no text, status text, category text,
               received_at timestamptz, decided_at timestamptz, closed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.case_no, r.status, r.category, r.received_at, r.decided_at, r.closed_at
    FROM integrity.report r
   WHERE r.tracking_code_hash = encode(sha256(convert_to(upper(trim(p_code)), 'UTF8')), 'hex')
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION pub.track_integrity_report(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.integrity_case TO vsp_portal;
    GRANT EXECUTE ON FUNCTION pub.track_integrity_report(text) TO vsp_portal;
  END IF;
END $$;
