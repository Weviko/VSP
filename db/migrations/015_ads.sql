-- ============================================================================
-- 015. 광고 지면 공개 노출 (content.ad_slot / ad_placement 는 004 에 있음)
--
-- 광고·스폰서십이 주 수익원이고, 광고 수익을 해당 종목 협회에 배분하는 구조가 체육회 설득의 핵심(문서 04).
-- 공개 쪽에는 "지금 노출할 광고"만 내보낸다: 활성 지면 + 게재중(ACTIVE) + 기간 내.
--   수익 배분(revenue_share_*)·노출/클릭 수치는 내부 전용 — 공개 뷰에 넣지 않는다.
-- 지면은 기본 비활성(is_active=false): 트래픽이 쌓인 뒤 협회 합의로 켠다.
-- ============================================================================

CREATE OR REPLACE VIEW pub.ad AS
SELECT s.code AS slot_code, s.name_i18n AS slot_name, s.width, s.height,
       pl.id AS placement_id, pl.sponsor_name, pl.image_url, pl.link_url
  FROM content.ad_slot s
  JOIN content.ad_placement pl ON pl.slot_id = s.id
 WHERE s.is_active
   AND pl.status = 'ACTIVE'
   AND (pl.starts_on IS NULL OR pl.starts_on <= CURRENT_DATE)
   AND (pl.ends_on   IS NULL OR pl.ends_on   >= CURRENT_DATE);

DO $$
BEGIN
  GRANT SELECT ON pub.ad TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 광고 공개 뷰 권한 부여를 건너뜁니다.';
END
$$;
