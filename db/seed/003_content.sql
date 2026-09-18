-- 콘텐츠/기자 관련 기초 데이터

-- PRESS 역할 추가: 승인된 기자만 기사 작성 메뉴가 보인다
INSERT INTO core.role(code, name_i18n, is_admin, permissions) VALUES
 ('PRESS', '{"vi":"Phóng viên được cấp phép","en":"Accredited Press","ko":"승인 기자"}', false,
  '["article.write","article.self.edit","event.read","athlete.read.public"]'),
 ('MEDIA_ORG', '{"vi":"Cơ quan báo chí","en":"Media Organization","ko":"언론사"}', false,
  '["article.read.own_org","press.request"]')
ON CONFLICT (code) DO NOTHING;

-- 언론사도 조직 트리에 들어간다 (기자의 소속 확인용)
INSERT INTO core.org_level_type(code, name_i18n, sort_order, description) VALUES
 ('MEDIA', '{"vi":"Cơ quan báo chí","en":"Media outlet","ko":"언론사"}', 95, '기자 소속 확인용')
ON CONFLICT (code) DO NOTHING;

-- 기자 자격 신청 서식
INSERT INTO core.form_definition (code, version, title_i18n, description_i18n, sla_days, status, effective_from)
VALUES (
  'PRESS_ACCRED', 1,
  '{"vi":"Đơn xin cấp thẻ phóng viên","en":"Press Accreditation Request","ko":"기자 자격 신청서"}',
  '{"vi":"Chỉ phóng viên được liên đoàn phê duyệt mới được viết bài.","en":"Only federation-approved reporters may publish articles.","ko":"협회 승인을 받은 기자만 기사를 작성할 수 있습니다."}',
  10, 'ACTIVE', CURRENT_DATE
) ON CONFLICT DO NOTHING;

INSERT INTO core.form_field (form_id, field_key, label_i18n, data_type, is_required, section, sort_order)
SELECT f.id, v.field_key, v.label_i18n::jsonb, v.data_type, v.is_required, v.section, v.sort_order
FROM core.form_definition f
CROSS JOIN (VALUES
  ('full_name',   '{"vi":"Họ và tên","en":"Full name","ko":"성명"}',                      'text', true,  'identity', 10),
  ('media_org',   '{"vi":"Cơ quan báo chí","en":"Media outlet","ko":"소속 언론사"}',       'org',  true,  'identity', 20),
  ('press_card',  '{"vi":"Thẻ nhà báo","en":"Press card","ko":"기자증"}',                  'file', true,  'document', 30),
  ('assignment',  '{"vi":"Giấy giới thiệu","en":"Assignment letter","ko":"취재 의뢰서"}',   'file', true,  'document', 40),
  ('scope_sport', '{"vi":"Môn thể thao phụ trách","en":"Sports covered","ko":"담당 종목"}','select', false,'scope',   50),
  ('phone',       '{"vi":"Số điện thoại","en":"Phone","ko":"전화번호"}',                   'text', true,  'contact',  60)
) AS v(field_key, label_i18n, data_type, is_required, section, sort_order)
WHERE f.code = 'PRESS_ACCRED' AND f.version = 1
ON CONFLICT (form_id, field_key) DO NOTHING;

-- 기자 자격 승인 결재선: 해당 종목 협회가 승인
INSERT INTO core.workflow_definition (code, version, name_i18n, applies_to_form, status)
VALUES ('PRESS_ACCRED_1STEP', 1,
  '{"vi":"Phê duyệt thẻ phóng viên","en":"Press accreditation approval","ko":"기자 자격 승인"}',
  'PRESS_ACCRED', 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO core.workflow_step (workflow_id, step_no, name_i18n, approver_type, approver_role, mode, sla_hours, is_final)
SELECT w.id, 1,
  '{"vi":"Liên đoàn phê duyệt","en":"Federation approval","ko":"협회 승인"}'::jsonb,
  'ROLE_IN_PARENT_ORG', 'ORG_HEAD', 'SEQUENTIAL', 240, true
FROM core.workflow_definition w
WHERE w.code = 'PRESS_ACCRED_1STEP' AND w.version = 1
ON CONFLICT (workflow_id, step_no) DO NOTHING;

-- 광고 지면 정의 (기본 비활성 — 트래픽이 쌓인 뒤 켠다)
INSERT INTO content.ad_slot(code, name_i18n, placement, width, height, is_active) VALUES
 ('HOME_TOP',       '{"vi":"Trang chủ - đầu trang","en":"Home top","ko":"홈 상단"}',        'home',   1200, 200, false),
 ('SPORT_SIDEBAR',  '{"vi":"Môn thể thao - cột bên","en":"Sport sidebar","ko":"종목 사이드"}','sport',  300,  600, false),
 ('EVENT_DETAIL',   '{"vi":"Chi tiết giải đấu","en":"Event detail","ko":"대회 상세"}',       'event',  728,   90, false),
 ('ARTICLE_INLINE', '{"vi":"Trong bài viết","en":"In-article","ko":"기사 본문"}',            'article',600,  200, false)
ON CONFLICT (code) DO NOTHING;
