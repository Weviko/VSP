-- 기초 코드 데이터 (베트남 실정 확인 후 조정 가능 — 전부 데이터이므로 코드 수정 불필요)

INSERT INTO core.org_level_type(code, name_i18n, sort_order, description) VALUES
 ('MINISTRY',      '{"vi":"Bộ","en":"Ministry","ko":"부처"}',                          10, 'Bộ VHTTDL'),
 ('SPORTS_AUTH',   '{"vi":"Cục TDTT","en":"Sports Authority","ko":"체육국"}',           20, 'Cục Thể dục Thể thao'),
 ('NOC',           '{"vi":"Ủy ban Olympic","en":"NOC","ko":"올림픽위원회"}',            30, 'VOC'),
 ('NATIONAL_FED',  '{"vi":"Liên đoàn quốc gia","en":"National Federation","ko":"국가연맹"}', 40, NULL),
 ('PROVINCE_DEPT', '{"vi":"Sở VHTT","en":"Provincial Dept","ko":"성/시 체육국"}',       50, NULL),
 ('PROVINCE_FED',  '{"vi":"Liên đoàn tỉnh","en":"Provincial Federation","ko":"성/시 연맹"}', 60, NULL),
 ('DISTRICT',      '{"vi":"Cấp xã/phường","en":"Commune/Ward","ko":"사/방"}',           70, '2025 개편 후 2단계 지방행정'),
 ('CLUB',          '{"vi":"Câu lạc bộ","en":"Club","ko":"클럽"}',                      80, NULL),
 ('ACADEMY',       '{"vi":"Trung tâm đào tạo","en":"Training Center","ko":"훈련센터"}', 85, '인도 NSRS 모델: 아카데미를 독립 주체로'),
 ('SCHOOL',        '{"vi":"Trường học","en":"School","ko":"학교"}',                     90, NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO core.role(code, name_i18n, is_admin, permissions) VALUES
 ('SYS_ADMIN',   '{"vi":"Quản trị hệ thống","en":"System Admin","ko":"시스템 관리자"}',  true,  '["*"]'),
 ('GOV_ADMIN',   '{"vi":"Quản lý nhà nước","en":"Government Admin","ko":"정부 관리자"}', true,  '["org.*","event.approve","report.*","stat.*"]'),
 ('ORG_HEAD',    '{"vi":"Lãnh đạo đơn vị","en":"Org Head","ko":"단체장/전결권자"}',      false, '["org.self.*","approve.final","member.*","event.*"]'),
 ('ORG_STAFF',   '{"vi":"Cán bộ","en":"Staff","ko":"실무자"}',                          false, '["org.self.read","registration.*","event.draft","doc.draft"]'),
 ('ORG_FINANCE', '{"vi":"Kế toán","en":"Finance","ko":"회계담당"}',                     false, '["payment.*","ledger.*","report.finance"]'),
 ('ORG_MEDIA',   '{"vi":"Truyền thông","en":"Media","ko":"홍보담당"}',                  false, '["content.*","event.read"]'),
 ('COACH',       '{"vi":"Huấn luyện viên","en":"Coach","ko":"지도자"}',                 false, '["athlete.tag","performance.write","entry.submit"]'),
 ('MEMBER',      '{"vi":"Thành viên","en":"Member","ko":"일반회원"}',                   false, '["self.*"]')
ON CONFLICT (code) DO NOTHING;

-- 시즌: 역년 기본
INSERT INTO core.season(code, name_i18n, scope_type, starts_on, ends_on, is_current) VALUES
 ('2026', '{"vi":"Mùa giải 2026","en":"Season 2026","ko":"2026 시즌"}', 'GLOBAL', '2026-01-01', '2026-12-31', true)
ON CONFLICT DO NOTHING;

-- TODO(확인필요): 베트남 34개 성/시 정식 명칭·코드 목록을 체육회에서 수령 후 region 시드 삽입.
--   2025.7.1 결의 202/2025/QH15로 63 → 34 통합. 구 지역코드는 organization.legacy_region_codes에 보관.
