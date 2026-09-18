-- ============================================================================
-- 011. 구독 (MY팀 — 관심 종목·단체 팔로우)
--
-- 네이버 MY팀처럼 회원이 종목·단체를 구독한다. 구독하면 그 대상 중심으로 화면을 재구성하고,
-- 구독자 수는 대중 인기 지표가 된다 — 이는 후원 중개(문서 06)에서 단체·선수의 가치 근거로 쓴다.
--
-- 대상은 다형(polymorphic): SPORT(종목) / ORG(단체). 한 사람이 같은 대상을 중복 구독하지 못한다.
-- 공개 쪽에는 "구독자 수"만 집계로 내보낸다(누가 구독했는지는 공개하지 않는다).
-- ============================================================================

CREATE TABLE core.subscription (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  target_type   text NOT NULL,                 -- SPORT / ORG
  target_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(person_id, target_type, target_id)
);
CREATE INDEX ON core.subscription(target_type, target_id);
CREATE INDEX ON core.subscription(person_id);

-- 공개 집계: 대상별 구독자 수만. 누가 구독했는지는 내보내지 않는다.
CREATE OR REPLACE VIEW pub.subscriber_count AS
SELECT target_type, target_id, count(*)::int AS n
  FROM core.subscription
 GROUP BY target_type, target_id;

DO $$
BEGIN
  GRANT SELECT ON pub.subscriber_count TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 구독자 수 권한 부여를 건너뜁니다.';
END
$$;
