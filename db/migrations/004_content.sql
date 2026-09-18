-- =====================================================================
-- VSP 004: 콘텐츠 (공개 페이지 / 뉴스 / 홍보)
-- 광고·스폰서십이 주 수익원이므로 이 영역이 곧 사업 수익이다.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS content;

-- ── 기사 ─────────────────────────────────────────────────────────────
CREATE TABLE content.article (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,           -- SEO용 URL (검색 유입 = 광고 수익)
  title_i18n    jsonb NOT NULL,
  summary_i18n  jsonb,
  body_i18n     jsonb,
  cover_url     text,

  -- 출처 구분: 독자가 "자동 생성"과 "기자 작성"을 구별할 수 있어야 신뢰가 생긴다
  source        text NOT NULL DEFAULT 'AUTO',   -- AUTO / PRESS / ORG / PARTNER
  -- 자동 생성 기사는 원천 데이터를 참조한다 (결과가 정정되면 기사도 갱신)
  ref_type      text,                           -- EVENT / EVENT_RESULT / PERSON
  ref_id        uuid,

  -- 작성 주체와 책임 소재 (오보·분쟁 대비)
  author_person_id uuid REFERENCES core.person(id),
  author_org_id    uuid REFERENCES core.organization(id),   -- 소속 언론사
  approved_by_org_id uuid REFERENCES core.organization(id), -- 기자 자격을 승인한 협회

  -- 분류
  sport_id      uuid REFERENCES sport.sport(id),
  event_id      uuid REFERENCES sport.event(id),
  tags          text[],

  -- 게시 상태: 검수가 필요한 협회는 REVIEW 단계를 거친다
  status        text NOT NULL DEFAULT 'DRAFT',  -- DRAFT / REVIEW / PUBLISHED / HIDDEN
  review_submission_id uuid REFERENCES core.form_submission(id),
  published_at  timestamptz,
  view_count    bigint NOT NULL DEFAULT 0,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX ON content.article(status, published_at DESC);
CREATE INDEX ON content.article(sport_id, published_at DESC);
CREATE INDEX ON content.article(event_id);
CREATE INDEX ON content.article(author_person_id);

-- 기사에 등장한 선수 태깅 (선수 프로필에 관련 기사로 노출)
CREATE TABLE content.article_person (
  article_id    uuid NOT NULL REFERENCES content.article(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES core.person(id),
  PRIMARY KEY (article_id, person_id)
);

-- ── 기자 자격 ────────────────────────────────────────────────────────
-- 승인 절차 자체는 core의 결재 엔진을 재사용한다. 여기에는 결과만 남는다.
CREATE TABLE content.press_credential (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  media_org_id  uuid REFERENCES core.organization(id),   -- 소속 언론사
  -- 취재 허용 범위: 승인한 협회의 종목으로 제한할 수 있다
  approved_by_org_id uuid NOT NULL REFERENCES core.organization(id),
  scope_sport_ids uuid[],                                -- NULL = 전 종목
  credential_no text UNIQUE,
  submission_id uuid REFERENCES core.form_submission(id),
  -- 퇴사한 기자가 계속 쓰는 것을 막기 위해 유효기간을 둔다
  valid_from    date NOT NULL DEFAULT CURRENT_DATE,
  valid_to      date,
  status        text NOT NULL DEFAULT 'ACTIVE',          -- ACTIVE / SUSPENDED / EXPIRED
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON content.press_credential(person_id, status);

-- ── 팬 참여 (투표·응원) ──────────────────────────────────────────────
CREATE TABLE content.poll (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_i18n    jsonb NOT NULL,
  event_id      uuid REFERENCES sport.event(id),
  sport_id      uuid REFERENCES sport.sport(id),
  poll_type     text NOT NULL DEFAULT 'MVP',    -- MVP / BEST_TEAM / CUSTOM
  opens_at      timestamptz,
  closes_at     timestamptz,
  -- 중복 투표 방지 정책
  require_login boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'DRAFT',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content.poll_option (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       uuid NOT NULL REFERENCES content.poll(id) ON DELETE CASCADE,
  person_id     uuid REFERENCES core.person(id),
  team_id       uuid REFERENCES sport.team(id),
  label_i18n    jsonb,
  sort_order    int NOT NULL DEFAULT 0
);

CREATE TABLE content.poll_vote (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       uuid NOT NULL REFERENCES content.poll(id) ON DELETE CASCADE,
  option_id     uuid NOT NULL REFERENCES content.poll_option(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES core.account(id),
  voter_hash    text,                           -- 비로그인 허용 시 중복 억제용
  voted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON content.poll_vote(poll_id, account_id) WHERE account_id IS NOT NULL;
CREATE INDEX ON content.poll_vote(option_id);

-- 응원(좋아요) — 가볍게 참여시켜 재방문을 만든다
CREATE TABLE content.cheer (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type   text NOT NULL,                  -- PERSON / TEAM / EVENT / ARTICLE
  target_id     uuid NOT NULL,
  account_id    uuid REFERENCES core.account(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON content.cheer(target_type, target_id);

-- ── 광고 지면 (지금은 자리만 확보, 노출은 나중에) ────────────────────
CREATE TABLE content.ad_slot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,           -- HOME_TOP / SPORT_SIDEBAR / EVENT_DETAIL
  name_i18n     jsonb NOT NULL,
  placement     text,
  width         int,
  height        int,
  is_active     boolean NOT NULL DEFAULT false  -- 기본 비활성: 트래픽이 쌓인 뒤 켠다
);

CREATE TABLE content.ad_placement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id       uuid NOT NULL REFERENCES content.ad_slot(id),
  sponsor_org_id uuid REFERENCES core.organization(id),
  sponsor_name  text,
  image_url     text,
  link_url      text,
  -- 광고 수익을 해당 종목 협회에 배분하는 구조 (체육회 설득의 핵심 논리)
  revenue_share_org_id uuid REFERENCES core.organization(id),
  revenue_share_pct numeric(5,2),
  starts_on     date,
  ends_on       date,
  impressions   bigint NOT NULL DEFAULT 0,
  clicks        bigint NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'DRAFT'
);
CREATE INDEX ON content.ad_placement(slot_id, status);
