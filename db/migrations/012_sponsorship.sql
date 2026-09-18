-- ============================================================================
-- 012. 후원 중개 (sponsorship brokerage)
--
-- 사업 비전(문서 06): 선수 프로필·인기 지표(구독자 수·성적)를 기반으로 개인 스폰서십을 중개.
--
-- 안전 원칙 (반드시 지킨다):
--   - 플랫폼은 소개·매칭만 한다. 자금은 경유하지 않는다 (시행령 52/2024 결제중개 회피).
--     제안에 예산대(budget)는 참고 정보로 적을 뿐, 결제·정산은 플랫폼 밖 당사자 간에 한다.
--   - 미성년 선수는 후원 대상에서 제외한다 (공개 프로필과 동일 정책). 성인·공개 선수만 노출.
--   - 후원사 연락처는 비공개다. 제안을 받은 선수 본인만 본다. 공개 쪽에는 "후원 가능" 여부·인기 지표만.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS sponsorship;

-- 선수의 후원 프로필 (본인이 공개 여부를 켠다)
CREATE TABLE sponsorship.profile (
  person_id     uuid PRIMARY KEY REFERENCES core.person(id),
  is_open       boolean NOT NULL DEFAULT false,   -- 후원 제안 받기 on/off
  headline_i18n jsonb NOT NULL DEFAULT '{}'::jsonb, -- 한 줄 소개 (공개)
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 후원 제안 (후원사 → 선수). 연락처·메시지는 비공개(선수 본인만 열람).
CREATE TABLE sponsorship.proposal (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_person_id uuid NOT NULL REFERENCES core.person(id),
  sponsor_name      text NOT NULL,
  sponsor_contact   text,                          -- 비공개
  sponsor_org_id    uuid REFERENCES core.organization(id),
  submitted_by      uuid REFERENCES core.person(id),  -- 제안을 넣은 로그인 사용자
  message           text,
  budget            text,                          -- 예산대(참고). 금액을 플랫폼이 처리하지 않는다.
  status            text NOT NULL DEFAULT 'SENT',   -- SENT / VIEWED / ACCEPTED / DECLINED / WITHDRAWN
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz
);
CREATE INDEX ON sponsorship.proposal(athlete_person_id, status);
CREATE INDEX ON sponsorship.proposal(submitted_by);

-- 공개 노출: "후원 가능" 선수 목록. 성인·공개 선수만(pub.athlete), 연락처 없음.
-- 인기 지표(구독자 수)는 선수 개인 구독(target_type='PERSON')이 붙으면 반영된다.
CREATE OR REPLACE VIEW pub.sponsorship_open AS
SELECT a.person_id, a.full_name, a.name_latin, a.gender, a.birth_year, a.photo_url,
       sp.headline_i18n,
       COALESCE(sc.n, 0) AS followers
  FROM sponsorship.profile sp
  JOIN pub.athlete a ON a.person_id = sp.person_id      -- 성인·공개 선수만 통과
  LEFT JOIN pub.subscriber_count sc
         ON sc.target_type = 'PERSON' AND sc.target_id = sp.person_id
 WHERE sp.is_open;

DO $$
BEGIN
  GRANT SELECT ON pub.sponsorship_open TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 후원 공개 뷰 권한 부여를 건너뜁니다.';
END
$$;
