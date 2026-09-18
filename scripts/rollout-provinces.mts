/**
 * 성/시 본등록 — 전 종목 국가연맹에 34개 성/시 지부(PROVINCE_FED)를 일괄 생성한다.
 *
 * 2025 행정개편(Resolution 202/2025)으로 63 → 34개 성/시가 됐다. 아래 목록은 그 34개다.
 * ⚠ 공식 코드·명칭은 문체부 수령 후 확정한다(문서 08). 지금 region_code 는 임시 슬러그다 —
 *    코드가 오면 이 배열만 교체하고 다시 돌리면 된다(display_id 로 멱등 — 있으면 건너뛴다).
 *
 * 사용:
 *   npm run rollout:provinces               # 전 종목 × 34 성/시
 *   npm run rollout:provinces -- --feds=FED-FTB,FED-VOL   # 특정 연맹만
 *
 * 멱등: display_id 가 UNIQUE 라 ON CONFLICT DO NOTHING 으로 재실행해도 중복이 생기지 않는다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import { query, queryOne, closePool } from '../packages/core-admin/src/db.ts';

// [코드(임시), 성/시명(vi), 성/시명(ko), 구분]  — 중앙직할시 6 + 성 28 = 34
const PROVINCES: Array<[string, string, string]> = [
  // 중앙직할시 (6)
  ['HN', 'Hà Nội', '하노이'],
  ['HP', 'Hải Phòng', '하이퐁'],
  ['HUE', 'Huế', '후에'],
  ['DNG', 'Đà Nẵng', '다낭'],
  ['CT', 'Cần Thơ', '껀터'],
  ['HCM', 'TP. Hồ Chí Minh', '호치민'],
  // 성 (28)
  ['CB', 'Cao Bằng', '까오방'],
  ['LS', 'Lạng Sơn', '랑선'],
  ['LCH', 'Lai Châu', '라이쩌우'],
  ['DB', 'Điện Biên', '디엔비엔'],
  ['SL', 'Sơn La', '선라'],
  ['TQ', 'Tuyên Quang', '뚜옌꽝'],
  ['LCA', 'Lào Cai', '라오까이'],
  ['TN', 'Thái Nguyên', '타이응우옌'],
  ['PT', 'Phú Thọ', '푸토'],
  ['BN', 'Bắc Ninh', '박닌'],
  ['HY', 'Hưng Yên', '흥옌'],
  ['NB', 'Ninh Bình', '닌빈'],
  ['QN', 'Quảng Ninh', '꽝닌'],
  ['TH', 'Thanh Hóa', '타인호아'],
  ['NA', 'Nghệ An', '응에안'],
  ['HT', 'Hà Tĩnh', '하띤'],
  ['QT', 'Quảng Trị', '꽝찌'],
  ['QNG', 'Quảng Ngãi', '꽝응아이'],
  ['GL', 'Gia Lai', '자라이'],
  ['KH', 'Khánh Hòa', '카인호아'],
  ['DL', 'Đắk Lắk', '닥락'],
  ['LD', 'Lâm Đồng', '럼동'],
  ['DNA', 'Đồng Nai', '동나이'],
  ['TNI', 'Tây Ninh', '떠이닌'],
  ['VL', 'Vĩnh Long', '빈롱'],
  ['DT', 'Đồng Tháp', '동탑'],
  ['CM', 'Cà Mau', '까마우'],
  ['AG', 'An Giang', '안장'],
];

const arg = process.argv.find((a) => a.startsWith('--feds='));
const fedFilter = arg ? arg.slice('--feds='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;

const feds = await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM core.organization
    WHERE level_type = 'NATIONAL_FED' AND display_id LIKE 'FED-%'
      AND ($1::text[] IS NULL OR display_id = ANY($1))`,
  [fedFilter]
);
console.log(`\n성/시 본등록: 국가연맹 ${feds[0].n}개 × 성/시 ${PROVINCES.length}개`);
if (fedFilter) console.log(`  (연맹 한정: ${fedFilter.join(', ')})`);

const before = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM core.organization WHERE level_type='PROVINCE_FED'`))!.n;

for (const [code, vi, ko] of PROVINCES) {
  await query(
    `INSERT INTO core.organization (parent_id, level_type, name_i18n, display_id, region_code, status)
     SELECT f.id, 'PROVINCE_FED',
            jsonb_build_object(
              'vi', replace(replace(replace(f.name_i18n->>'vi','Liên đoàn ','LĐ '),'Hiệp hội ','HH '),' Việt Nam','') || ' ' || $2,
              'ko', $3 || ' ' || replace(replace(replace(f.name_i18n->>'ko','베트남 ',''),'연맹',''),'협회','')
            ),
            f.display_id || '-' || $1, $1, 'ACTIVE'
       FROM core.organization f
      WHERE f.level_type = 'NATIONAL_FED' AND f.display_id LIKE 'FED-%'
        AND ($4::text[] IS NULL OR f.display_id = ANY($4))
     ON CONFLICT (display_id) DO NOTHING`,
    [code, vi, ko, fedFilter]
  );
}

const after = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM core.organization WHERE level_type='PROVINCE_FED'`))!.n;
console.log(`\n성/시 지부 ${before} → ${after} (신규 ${after - before}개)\n`);

await closePool();
