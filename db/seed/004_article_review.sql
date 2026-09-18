-- 기사 검수 전자결재: 기사(REVIEW)를 정식 결재선에 태운다.
-- 제출 조직(작성 협회)의 장이 검수한다(SUBMITTER_ORG_HEAD). 승인/반려는 감사기록·SLA로 남는다.

INSERT INTO core.form_definition (code, version, title_i18n, description_i18n, sla_days, status, effective_from)
VALUES (
  'ARTICLE_REVIEW', 1,
  '{"vi":"Duyệt bài viết","en":"Article review","ko":"기사 검수"}',
  '{"vi":"Duyệt bài trước khi đăng công khai.","en":"Review an article before it is published.","ko":"공개 게시 전 기사 검수."}',
  3, 'ACTIVE', CURRENT_DATE
) ON CONFLICT DO NOTHING;

INSERT INTO core.form_field (form_id, field_key, label_i18n, data_type, is_required, section, sort_order)
SELECT f.id, v.field_key, v.label_i18n::jsonb, v.data_type, v.is_required, v.section, v.sort_order
FROM core.form_definition f
CROSS JOIN (VALUES
  ('title',   '{"vi":"Tiêu đề","en":"Title","ko":"제목"}',   'text',     true,  'article', 10),
  ('summary', '{"vi":"Tóm tắt","en":"Summary","ko":"요약"}', 'textarea', false, 'article', 20)
) AS v(field_key, label_i18n, data_type, is_required, section, sort_order)
WHERE f.code = 'ARTICLE_REVIEW' AND f.version = 1
ON CONFLICT (form_id, field_key) DO NOTHING;

INSERT INTO core.workflow_definition (code, version, name_i18n, applies_to_form, status)
VALUES ('ARTICLE_REVIEW_1STEP', 1,
  '{"vi":"Duyệt bài viết","en":"Article review","ko":"기사 검수 결재"}',
  'ARTICLE_REVIEW', 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO core.workflow_step (workflow_id, step_no, name_i18n, approver_type, approver_role, mode, sla_hours, is_final)
SELECT w.id, 1,
  '{"vi":"Trưởng đơn vị duyệt","en":"Unit head review","ko":"소속 기관장 검수"}'::jsonb,
  'SUBMITTER_ORG_HEAD', 'ORG_HEAD', 'SEQUENTIAL', 72, true
FROM core.workflow_definition w
WHERE w.code = 'ARTICLE_REVIEW_1STEP' AND w.version = 1
ON CONFLICT (workflow_id, step_no) DO NOTHING;
