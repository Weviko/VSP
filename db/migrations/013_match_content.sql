-- ============================================================================
-- 013. 경기 상세 콘텐츠 — 문자중계 · 영상 (+ 뉴스 공개 뷰)
--
-- 네이버 경기 상세의 중계·뉴스·영상 탭을 채운다(문서 14 §5-B).
--   - 문자중계(relay): 경기 진행을 시간순 한 줄씩. 경기별 타임라인.
--   - 영상(video): 하이라이트·다시보기. 경기/대회/종목에 묶는다. 링크·썸네일만 다룬다(임베드는 IT팀).
--   - 뉴스(news): 기존 content.article 을 공개 뷰로 노출(기사 모델은 이미 004 에 있다).
--
-- 공개 원칙(007 과 동일): 공개(승인)된 경기·대회의 콘텐츠만, 게시된 것만 내보낸다.
--   기사 작성자의 개인정보(기자 개인명)는 공개하지 않는다 — 언론사(조직)명만 바이라인으로.
-- ============================================================================

-- ── 문자중계 ────────────────────────────────────────────────────────────────
CREATE TABLE content.match_relay (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES sport.match(id) ON DELETE CASCADE,
  seq         int NOT NULL,                        -- 표시 순서(작을수록 이른 시점)
  clock       text,                                -- "12'", "45'+2", "3Q 04:11"
  side        text,                                -- A/B/HOME/AWAY 또는 NULL(공지)
  kind        text NOT NULL DEFAULT 'INFO',        -- GOAL/CARD/SUB/PERIOD/INFO ...
  text_i18n   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, seq)
);
CREATE INDEX ON content.match_relay(match_id, seq);

-- ── 영상 ────────────────────────────────────────────────────────────────────
CREATE TABLE content.video (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid REFERENCES sport.match(id) ON DELETE CASCADE,
  event_id      uuid REFERENCES sport.event(id),
  sport_id      uuid REFERENCES sport.sport(id),
  title_i18n    jsonb NOT NULL,
  provider      text NOT NULL DEFAULT 'YOUTUBE',   -- YOUTUBE / FILE / URL
  external_id   text,                              -- provider=YOUTUBE 일 때 영상 id
  url           text,                              -- provider=URL/FILE 일 때
  thumbnail_url text,
  duration_seconds int,
  sort_order    int NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'PUBLISHED', -- DRAFT / PUBLISHED / HIDDEN
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX ON content.video(match_id);
CREATE INDEX ON content.video(event_id, sort_order);
CREATE INDEX ON content.video(sport_id, published_at DESC);

-- ── 공개 뷰 ──────────────────────────────────────────────────────────────────

-- 문자중계: 공개(승인)된 경기의 중계만. pub.match 를 통과해야 보인다.
CREATE OR REPLACE VIEW pub.match_relay AS
SELECT r.id, r.match_id, r.seq, r.clock, r.side, r.kind, r.text_i18n, r.created_at
  FROM content.match_relay r
  JOIN pub.match m ON m.id = r.match_id;

-- 영상: 게시된 것만. 경기/대회에 묶인 영상은 그 경기/대회가 공개일 때만.
CREATE OR REPLACE VIEW pub.video AS
SELECT v.id, v.match_id, v.event_id, v.sport_id, v.title_i18n,
       v.provider, v.external_id, v.url, v.thumbnail_url, v.duration_seconds,
       v.sort_order, v.published_at
  FROM content.video v
 WHERE v.status = 'PUBLISHED'
   AND v.deleted_at IS NULL
   AND (v.match_id IS NULL OR v.match_id IN (SELECT id FROM pub.match))
   AND (v.event_id IS NULL OR v.event_id IN (SELECT id FROM pub.event));

-- 뉴스: 게시된 기사만. 기자 개인명은 내보내지 않고 언론사(조직)명만 바이라인으로.
CREATE OR REPLACE VIEW pub.article AS
SELECT a.id, a.slug, a.title_i18n, a.summary_i18n, a.body_i18n, a.cover_url,
       a.source, a.sport_id, a.event_id, a.tags, a.published_at, a.view_count,
       ao.name_i18n AS byline_i18n
  FROM content.article a
  LEFT JOIN core.organization ao ON ao.id = a.author_org_id
 WHERE a.status = 'PUBLISHED' AND a.deleted_at IS NULL;

DO $$
BEGIN
  GRANT SELECT ON pub.match_relay, pub.video, pub.article TO vsp_portal;
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'vsp_portal 역할이 없어 경기 콘텐츠 공개 뷰 권한 부여를 건너뜁니다.';
END
$$;
