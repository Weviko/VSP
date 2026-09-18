-- ============================================================================
-- 007. 공개 데이터 계층 (pub)
--
-- 대외 웹사이트(portal)는 이 스키마만 읽는다. 원본 테이블에는 접근하지 못한다.
--
-- 왜 필요한가:
--   공개 규칙(생년만 공개, 만 18세 미만은 보호자 동의 전 비공개, 승인된 것만 공개)이
--   지금까지는 화면마다 SQL 로 흩어져 있었다. 세 화면이 같은 규칙을 각자 구현했고,
--   그중 하나는 미성년 필터를 빠뜨렸고 하나는 반려된 등록까지 공개했다.
--   규칙을 여기 한 곳에만 두면 새 화면을 몇 개 만들어도 규칙이 새지 않는다.
--
-- 강제 수단:
--   vsp_portal 역할은 pub 스키마의 뷰만 SELECT 할 수 있다.
--   운영에서는 포털 앱이 이 역할의 로그인 계정으로 접속한다.
--   포털이 뚫려도 전화번호·신분증 해시·신청서·보조금 집행 내역은 DB 가 내주지 않는다.
--
-- 한국 N²SF(국가 망 보안체계)의 C/S/O 등급으로 보면 pub 은 O(공개) 영역이다.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS pub;
-- 공개 뷰를 만들기 위한 내부 재료. 포털 역할에는 권한을 주지 않는다.
CREATE SCHEMA IF NOT EXISTS pub_src;

-- ── 사람 ────────────────────────────────────────────────────────────────

-- 공개 가능한 선수.
--   승인된 선수 등록이 있어야 한다 — 협회 직원이나 반려된 신청자는 선수 페이지가 없다.
--   생년월일이 없으면 나이를 알 수 없으므로 공개하지 않는다 — 미성년일 수 있다.
--   만 18세 미만은 보호자의 초상권(PORTRAIT) 동의가 유효할 때만 공개한다.
CREATE OR REPLACE VIEW pub.athlete AS
SELECT p.id AS person_id,
       p.display_id,
       p.full_name,
       p.name_latin,
       p.gender,
       p.photo_url,
       EXTRACT(YEAR FROM p.birth_date)::int AS birth_year,
       -- 성조를 뗀 검색 키. "Nguyen" 으로 찾아도 "Nguyễn" 이 나와야 한다.
       translate(lower(COALESCE(p.name_latin, p.full_name)),
                 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
                 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd') AS name_key
  FROM core.person p
 WHERE p.deleted_at IS NULL
   AND p.status = 'ACTIVE'
   AND p.birth_date IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM sport.registration r
          WHERE r.person_id = p.id AND r.reg_type = 'ATHLETE' AND r.status = 'APPROVED'
       )
   AND (
         p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
         OR EXISTS (
              SELECT 1 FROM core.consent c
               WHERE c.person_id = p.id AND c.consent_type = 'PORTRAIT'
                 AND c.granted AND c.revoked_at IS NULL
            )
       );

-- 경기 기록에 이름을 표시하는 방법.
-- 공개 가능한 선수는 실명, 그 밖에는 머리글자만 (Nguyễn Văn An → N.V.A.).
-- 결과표가 읽히면서도 미성년 선수가 특정되지 않게 한다.
CREATE OR REPLACE VIEW pub_src.person_label AS
SELECT p.id AS person_id,
       a.person_id AS public_person_id,
       CASE WHEN a.person_id IS NOT NULL THEN p.full_name
            ELSE regexp_replace(p.full_name, '(\S)\S*\s*', '\1.', 'g')
       END AS label
  FROM core.person p
  LEFT JOIN pub.athlete a ON a.person_id = p.id;

CREATE OR REPLACE VIEW pub.athlete_registration AS
SELECT r.id AS registration_id,
       r.person_id,
       r.season_id,
       r.sport_id,
       s.code AS sport_code,
       s.name_i18n AS sport_name,
       r.org_id,
       o.name_i18n AS org_name,
       o.region_code,
       r.team_id,
       t.name_i18n AS team_name,
       d.name_i18n AS division_name
  FROM sport.registration r
  JOIN pub.athlete a ON a.person_id = r.person_id
  JOIN sport.sport s ON s.id = r.sport_id
  JOIN core.organization o ON o.id = r.org_id
  LEFT JOIN sport.team t ON t.id = r.team_id
  LEFT JOIN sport.discipline d ON d.id = r.primary_discipline_id
 WHERE r.reg_type = 'ATHLETE'
   AND r.status = 'APPROVED';

-- ── 종목 · 단체 ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW pub.sport AS
SELECT id, code, name_i18n, icon_url, international_federation,
       is_olympic, is_asiad, is_seagames, sort_order
  FROM sport.sport
 WHERE status = 'ACTIVE';

-- 단체 공시 항목. 세무코드·내부 설정·외부 ID 는 내보내지 않는다.
-- 심사 중(PENDING)이거나 폐지된(CLOSED) 단체는 명부에 올리지 않는다.
-- 정지(SUSPENDED)는 공익상 알려야 하므로 상태와 함께 공개한다.
CREATE OR REPLACE VIEW pub.organization AS
SELECT o.id, o.display_id, o.parent_id, o.level_type,
       lt.name_i18n AS level_name, lt.sort_order AS level_order,
       o.name_i18n, o.short_name, o.logo_url, o.region_code,
       o.established_at, o.effective_from,
       o.phone, o.email, o.website, o.address, o.status,
       (SELECT count(*)::int FROM core.org_member m
         WHERE m.org_id = o.id
           AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)) AS member_count
  FROM core.organization o
  JOIN core.org_level_type lt ON lt.code = o.level_type
 WHERE o.deleted_at IS NULL
   AND o.status IN ('ACTIVE', 'SUSPENDED')
   AND (o.effective_to IS NULL OR o.effective_to >= CURRENT_DATE);

-- ── 대회 ────────────────────────────────────────────────────────────────

-- 승인되고 공개로 지정된 대회만. 개최 신청 중이거나 반려된 대회는 보이지 않는다.
CREATE OR REPLACE VIEW pub.event AS
SELECT e.id, e.code, e.name_i18n,
       e.sport_id, s.code AS sport_code, s.name_i18n AS sport_name,
       e.season_id, e.host_org_id, o.name_i18n AS host_name,
       e.event_level, e.event_type, e.is_ranked, e.decision_no,
       e.starts_on, e.ends_on, e.venue_text,
       e.entry_opens_at, e.entry_closes_at, e.poster_url, e.status,
       (SELECT count(*)::int FROM sport.event_entry ee
         WHERE ee.event_id = e.id AND ee.status = 'CONFIRMED') AS entry_count
  FROM sport.event e
  LEFT JOIN sport.sport s ON s.id = e.sport_id
  JOIN core.organization o ON o.id = e.host_org_id
 WHERE e.is_public
   AND e.approval_status = 'APPROVED';

-- 참가 명단은 확정된 것만. 대기·반려·기권 신청은 공개하지 않는다.
CREATE OR REPLACE VIEW pub.event_entry AS
SELECT ee.id, ee.event_id, ee.event_category_id, ee.entry_type, ee.seed_no, ee.bib_no,
       pl.public_person_id AS person_id,
       COALESCE(pl.label, t.name_i18n->>'vi') AS label,
       ee.team_id, t.name_i18n AS team_name,
       ee.submitted_org_id AS org_id, o.name_i18n AS org_name
  FROM sport.event_entry ee
  JOIN pub.event e ON e.id = ee.event_id
  LEFT JOIN pub_src.person_label pl ON pl.person_id = ee.person_id
  LEFT JOIN sport.team t ON t.id = ee.team_id
  LEFT JOIN core.organization o ON o.id = ee.submitted_org_id
 WHERE ee.status = 'CONFIRMED';

CREATE OR REPLACE VIEW pub.match_participant AS
SELECT m.id AS match_id, m.event_id, m.event_category_id,
       m.round_name, m.match_no, m.scheduled_at, m.status,
       mp.entry_id, mp.side, mp.lane_no, mp.score, mp.result, mp.rank_in_match,
       COALESCE(pl.label, t.name_i18n->>'vi') AS label
  FROM sport.match m
  JOIN pub.event e ON e.id = m.event_id
  LEFT JOIN sport.match_participant mp ON mp.match_id = m.id
  LEFT JOIN sport.event_entry ee ON ee.id = mp.entry_id
  LEFT JOIN pub_src.person_label pl ON pl.person_id = ee.person_id
  LEFT JOIN sport.team t ON t.id = ee.team_id;

CREATE OR REPLACE VIEW pub.event_result AS
SELECT er.id, er.event_id, er.event_category_id,
       e.name_i18n AS event_name, e.starts_on, e.sport_id, e.sport_code,
       er.final_rank, er.medal, er.record_value, er.record_unit,
       er.is_record, er.record_scope, er.points,
       pl.public_person_id AS person_id,
       COALESCE(pl.label, t.name_i18n->>'vi') AS label,
       er.team_id, t.name_i18n AS team_name,
       er.org_id, o.name_i18n AS org_name
  FROM sport.event_result er
  JOIN pub.event e ON e.id = er.event_id
  LEFT JOIN pub_src.person_label pl ON pl.person_id = er.person_id
  LEFT JOIN sport.team t ON t.id = er.team_id
  LEFT JOIN core.organization o ON o.id = er.org_id;

-- ── 보조금 공시 ─────────────────────────────────────────────────────────

-- 검사를 통과해 공시로 지정된 건만. 집행 중인 수치는 계속 바뀌어 오해를 산다.
CREATE OR REPLACE VIEW pub.grant_disclosure AS
SELECT d.award_id, d.fiscal_year,
       o.name_i18n AS org_name, p.name_i18n AS program_name,
       d.summary, d.published_at
  FROM grant_mgmt.disclosure d
  JOIN grant_mgmt.award w ON w.id = d.award_id
  JOIN core.organization o ON o.id = w.grantee_org_id
  JOIN grant_mgmt.program p ON p.id = w.program_id
 WHERE d.is_public;

-- ── 통계 (집계만) ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW pub.stat_totals AS
SELECT (SELECT count(*)::int FROM sport.registration
         WHERE reg_type = 'ATHLETE' AND status = 'APPROVED') AS athletes,
       (SELECT count(*)::int FROM pub.organization) AS orgs,
       (SELECT count(*)::int FROM pub.event WHERE status <> 'CANCELLED') AS events,
       (SELECT count(*)::int FROM pub.sport) AS sports;

CREATE OR REPLACE VIEW pub.stat_by_reg_type AS
SELECT r.reg_type,
       count(*)::int AS total,
       count(*) FILTER (WHERE p.gender = 'M')::int AS male,
       count(*) FILTER (WHERE p.gender = 'F')::int AS female
  FROM sport.registration r
  JOIN core.person p ON p.id = r.person_id
 WHERE r.status = 'APPROVED'
 GROUP BY r.reg_type;

CREATE OR REPLACE VIEW pub.stat_by_region AS
SELECT o.region_code,
       count(DISTINCT r.id) FILTER (WHERE r.reg_type = 'ATHLETE' AND r.status = 'APPROVED')::int AS athletes,
       count(DISTINCT o.id)::int AS orgs
  FROM pub.organization o
  LEFT JOIN sport.registration r ON r.org_id = o.id
 WHERE o.region_code IS NOT NULL
 GROUP BY o.region_code;

CREATE OR REPLACE VIEW pub.stat_by_age AS
SELECT CASE
         WHEN p.birth_date IS NULL THEN 'unknown'
         WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 20 THEN '10s'
         WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 30 THEN '20s'
         WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 40 THEN '30s'
         WHEN EXTRACT(YEAR FROM age(p.birth_date)) < 50 THEN '40s'
         ELSE '50s+'
       END AS age_group,
       count(*)::int AS total
  FROM sport.registration r
  JOIN core.person p ON p.id = r.person_id
 WHERE r.status = 'APPROVED'
 GROUP BY 1;

CREATE OR REPLACE VIEW pub.stat_by_sport AS
SELECT s.id AS sport_id, s.code AS sport_code, s.name_i18n AS sport_name,
       (SELECT count(*)::int FROM sport.registration r
         WHERE r.sport_id = s.id AND r.reg_type = 'ATHLETE' AND r.status = 'APPROVED') AS athletes,
       (SELECT count(*)::int FROM sport.registration r
         WHERE r.sport_id = s.id AND r.reg_type = 'COACH' AND r.status = 'APPROVED') AS coaches,
       (SELECT count(*)::int FROM sport.registration r
         WHERE r.sport_id = s.id AND r.reg_type = 'REFEREE' AND r.status = 'APPROVED') AS referees,
       (SELECT count(*)::int FROM sport.team t
         WHERE t.sport_id = s.id AND t.status = 'ACTIVE') AS teams,
       (SELECT count(*)::int FROM pub.event e
         WHERE e.sport_id = s.id AND e.starts_on >= CURRENT_DATE AND e.status <> 'CANCELLED') AS upcoming_events,
       (SELECT count(*)::int FROM pub.event e
         WHERE e.sport_id = s.id AND e.status = 'FINISHED') AS finished_events
  FROM pub.sport s;

-- ── 증명서 진위확인 ─────────────────────────────────────────────────────

-- 뷰로 두면 포털 역할이 증명서 전체 목록(발급 대상자 이름 포함)을 긁어갈 수 있다.
-- 코드 한 건을 넣었을 때 한 건만 돌려주는 함수로 두고, 함수 실행 권한만 준다.
CREATE OR REPLACE FUNCTION pub.verify_certificate(p_code text)
RETURNS TABLE (doc_no text, title text, issued_at timestamptz, org_name jsonb, subject_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT d.doc_no, d.title, d.issued_at, o.name_i18n,
         (SELECT p.full_name FROM core.attachment a
            JOIN core.person p ON ('person:' || p.id) = a.storage_key
           WHERE a.owner_type = 'DOCUMENT' AND a.owner_id = d.id
           LIMIT 1)
    FROM core.document d
    LEFT JOIN core.organization o ON o.id = d.from_org_id
   WHERE d.verify_code = upper(trim(p_code))
     AND d.issued_at IS NOT NULL
   LIMIT 1
$$;

-- ── 권한 ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION pub.verify_certificate(text) FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vsp_portal') THEN
    CREATE ROLE vsp_portal NOLOGIN;
  END IF;
  GRANT USAGE ON SCHEMA pub TO vsp_portal;
  GRANT SELECT ON ALL TABLES IN SCHEMA pub TO vsp_portal;
  GRANT EXECUTE ON FUNCTION pub.verify_certificate(text) TO vsp_portal;
  -- 이후 마이그레이션에서 pub 에 뷰를 추가해도 따로 권한을 줄 필요가 없게 한다
  ALTER DEFAULT PRIVILEGES IN SCHEMA pub GRANT SELECT ON TABLES TO vsp_portal;
EXCEPTION WHEN insufficient_privilege THEN
  -- 관리형 DB 에서 역할 생성 권한이 없을 수 있다. 그때는 운영자가 직접 만든다 (README 참조).
  RAISE NOTICE 'vsp_portal 역할을 만들 권한이 없습니다. 운영자가 직접 생성해야 합니다.';
END
$$;
