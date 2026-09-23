-- ============================================================================
-- 030. 경기 운영 심화 공개 계층 (pub)
--
-- 공개·승인 대회의 경기 심판(성인·배정/확정)만 이름·역할로 노출한다.
-- 기존 pub.match(009) 뷰는 건드리지 않는다(다른 코드가 의존). 심판만 별도 뷰로 추가.
-- ============================================================================

CREATE OR REPLACE VIEW pub.match_official AS
SELECT mo.match_id,
       p.full_name,
       p.name_latin,
       mo.role
  FROM sport.match_official mo
  JOIN core.person p ON p.id = mo.person_id
  JOIN sport.match m ON m.id = mo.match_id
  JOIN sport.event ev ON ev.id = m.event_id
 WHERE mo.status IN ('ASSIGNED','CONFIRMED')
   AND ev.is_public = true AND ev.approval_status = 'APPROVED'
   AND p.deleted_at IS NULL
   AND p.birth_date IS NOT NULL
   AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    GRANT SELECT ON pub.match_official TO vsp_portal;
  END IF;
END $$;
