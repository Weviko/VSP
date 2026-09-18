-- ============================================================================
-- 014. 팬 참여 — 투표(MVP 등) · 응원(좋아요) 공개 집계
--
-- 재방문을 만드는 가벼운 참여 장치(문서 04). 공개 쪽에는 "집계"만 내보낸다:
--   - 누가 투표/응원했는지는 공개하지 않는다(개인 식별 금지).
--   - 열린(OPEN) 투표만, 공개 대회/전역 투표만 노출한다.
--   - 미성년 후보 이름은 pub_src.person_label 로 마스킹된다.
-- 실제 투표·응원은 로그인한 업무 플랫폼에서 한다(대외 웹은 읽기 전용).
-- ============================================================================

-- 열린 투표 (공개)
CREATE OR REPLACE VIEW pub.poll AS
SELECT p.id, p.title_i18n, p.poll_type, p.event_id, p.sport_id, p.opens_at, p.closes_at,
       (SELECT count(*)::int FROM content.poll_vote v WHERE v.poll_id = p.id) AS total_votes
  FROM content.poll p
  LEFT JOIN pub.event e ON e.id = p.event_id
 WHERE p.status = 'OPEN'
   AND (p.event_id IS NULL OR e.id IS NOT NULL);   -- 대회 연동 투표는 공개 대회만

-- 투표 선택지 + 득표 집계 (후보 이름은 라벨/팀명/마스킹된 개인명)
CREATE OR REPLACE VIEW pub.poll_option AS
SELECT o.id, o.poll_id, o.sort_order,
       COALESCE(o.label_i18n->>'vi', t.name_i18n->>'vi', pl.label) AS label,
       pl.public_person_id AS person_id,
       o.team_id, t.name_i18n AS team_name,
       (SELECT count(*)::int FROM content.poll_vote v WHERE v.option_id = o.id) AS votes
  FROM content.poll_option o
  JOIN content.poll p ON p.id = o.poll_id AND p.status = 'OPEN'
  LEFT JOIN sport.team t ON t.id = o.team_id
  LEFT JOIN pub_src.person_label pl ON pl.person_id = o.person_id;

-- 응원(좋아요) 대상별 집계. 누가 눌렀는지는 내보내지 않는다.
CREATE OR REPLACE VIEW pub.cheer_count AS
SELECT target_type, target_id, count(*)::int AS n
  FROM content.cheer
 GROUP BY target_type, target_id;

DO $$
BEGIN
  GRANT SELECT ON pub.poll, pub.poll_option, pub.cheer_count TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 팬 참여 공개 뷰 권한 부여를 건너뜁니다.';
END
$$;
