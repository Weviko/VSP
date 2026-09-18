-- 등록 모듈 기초 데이터
-- 주의: 아래 폼/결재선은 체육회 공식 서식 수령 전의 임시 표준이다.
--       전부 데이터이므로 실물 서식이 오면 관리자 화면에서 교체하면 되고 코드 수정은 없다.

-- ── 표준 서식: 선수 등록 신청서 ───────────────────────────────────
INSERT INTO core.form_definition (code, version, title_i18n, description_i18n, legal_basis, sla_days, status, effective_from)
VALUES (
  'ATHLETE_REG', 1,
  '{"vi":"Đơn đăng ký vận động viên","en":"Athlete Registration","ko":"선수 등록 신청서"}',
  '{"vi":"Đăng ký theo mùa giải. Cần xác nhận của đơn vị chủ quản.","en":"Seasonal registration. Requires affiliation approval.","ko":"시즌별 등록. 소속 단체 확인 필요."}',
  NULL, 15, 'ACTIVE', CURRENT_DATE
) ON CONFLICT DO NOTHING;

INSERT INTO core.form_field (form_id, field_key, label_i18n, data_type, is_required, bind_to, section, sort_order, validation, options)
SELECT f.id, v.field_key, v.label_i18n::jsonb, v.data_type, v.is_required, v.bind_to, v.section, v.sort_order,
       v.validation::jsonb, v.options::jsonb
FROM core.form_definition f
CROSS JOIN (VALUES
  ('full_name',   '{"vi":"Họ và tên","en":"Full name","ko":"성명"}',                 'text',   true,  'person.full_name',  'identity', 10, NULL, NULL),
  ('name_latin',  '{"vi":"Tên Latin (không dấu)","en":"Latin name","ko":"로마자 성명"}','text', false, 'person.name_latin', 'identity', 20, NULL, NULL),
  ('gender',      '{"vi":"Giới tính","en":"Gender","ko":"성별"}',                     'select', true,  'person.gender',     'identity', 30, NULL,
     '[{"value":"M","label_i18n":{"vi":"Nam","en":"Male","ko":"남"}},{"value":"F","label_i18n":{"vi":"Nữ","en":"Female","ko":"여"}}]'),
  ('birth_date',  '{"vi":"Ngày sinh","en":"Date of birth","ko":"생년월일"}',          'date',   true,  'person.birth_date', 'identity', 40, NULL, NULL),
  ('id_doc_no',   '{"vi":"Số CCCD/Hộ chiếu","en":"ID/Passport No.","ko":"신분증 번호"}','text',  true,  NULL,                'identity', 50, NULL, NULL),
  ('phone',       '{"vi":"Số điện thoại","en":"Phone","ko":"전화번호"}',              'text',   true,  'person.phone',      'contact',  60,
     '{"regex":"^0[0-9]{9}$"}', NULL),
  ('photo',       '{"vi":"Ảnh chân dung","en":"Portrait photo","ko":"증명사진"}',      'file',   true,  NULL,                'identity', 70, NULL, NULL),
  ('team',        '{"vi":"Đơn vị/CLB","en":"Team/Club","ko":"소속팀"}',               'org',    true,  NULL,                'affiliation', 80, NULL, NULL),
  ('discipline',  '{"vi":"Nội dung thi đấu","en":"Discipline","ko":"세부종목"}',       'select', true,  NULL,                'sport',    90, NULL, NULL),
  ('height_cm',   '{"vi":"Chiều cao (cm)","en":"Height (cm)","ko":"신장(cm)"}',       'number', false, NULL,                'physical', 100,
     '{"min":80,"max":250}', NULL),
  ('weight_kg',   '{"vi":"Cân nặng (kg)","en":"Weight (kg)","ko":"체중(kg)"}',        'number', false, NULL,                'physical', 110,
     '{"min":15,"max":250}', NULL),
  ('health_cert', '{"vi":"Giấy khám sức khỏe","en":"Health certificate","ko":"건강검진서"}','file', false, NULL,           'document', 120, NULL, NULL),
  ('guardian_consent','{"vi":"Đồng ý của người bảo hộ (dưới 18 tuổi)","en":"Guardian consent (under 18)","ko":"보호자 동의(18세 미만)"}',
     'file', false, NULL, 'document', 130, NULL, NULL)
) AS v(field_key, label_i18n, data_type, is_required, bind_to, section, sort_order, validation, options)
WHERE f.code = 'ATHLETE_REG' AND f.version = 1
ON CONFLICT (form_id, field_key) DO NOTHING;

-- ── 표준 결재선: 2단계 (성/시 연맹 → 국가연맹) ────────────────────
INSERT INTO core.workflow_definition (code, version, name_i18n, applies_to_form, status)
VALUES ('ATHLETE_REG_2STEP', 1,
  '{"vi":"Phê duyệt đăng ký VĐV (2 cấp)","en":"Athlete registration approval (2 steps)","ko":"선수등록 승인(2단계)"}',
  'ATHLETE_REG', 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO core.workflow_step (workflow_id, step_no, name_i18n, approver_type, approver_role, mode, sla_hours, is_final)
SELECT w.id, v.step_no, v.name_i18n::jsonb, v.approver_type, v.approver_role, v.mode, v.sla_hours, v.is_final
FROM core.workflow_definition w
CROSS JOIN (VALUES
  (1, '{"vi":"Liên đoàn tỉnh/thành xác nhận","en":"Provincial federation review","ko":"성/시 연맹 1차 승인"}',
      'SUBMITTER_ORG_HEAD', 'ORG_HEAD', 'SEQUENTIAL', 72,  false),
  (2, '{"vi":"Liên đoàn quốc gia phê duyệt","en":"National federation approval","ko":"국가연맹 최종 승인"}',
      'ROLE_IN_PARENT_ORG', 'ORG_HEAD', 'SEQUENTIAL', 120, true)
) AS v(step_no, name_i18n, approver_type, approver_role, mode, sla_hours, is_final)
WHERE w.code = 'ATHLETE_REG_2STEP' AND w.version = 1
ON CONFLICT (workflow_id, step_no) DO NOTHING;
