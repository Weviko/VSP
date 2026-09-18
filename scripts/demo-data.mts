/**
 * 데모 데이터 — 화면을 실제로 확인하기 위한 최소 데이터.
 * 체육회에서 실제 명단을 받으면 이 스크립트는 버린다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import { query, execScript, closePool } from '../packages/core-admin/src/db.ts';
import { createOrganization as createOrg } from '../packages/core-admin/src/organization.ts';

const force = process.argv.includes('--force');
const existing = await query<{ n: number }>(
  `SELECT count(*)::int AS n FROM core.organization WHERE display_id LIKE 'FED-%'`
);
// 데모 데이터는 깨끗한 DB를 전제로 한다.
// 다시 넣으려면: npm run db:reset && npm run demo
if (existing[0].n > 0 && !force) {
  console.log(`\n  이미 조직 ${existing[0].n}개가 있습니다. 건너뜁니다.\n`);
  await closePool();
  process.exit(0);
}

console.log('\n데모 데이터 생성:');

const sav = await createOrg({
  levelType: 'SPORTS_AUTH',
  nameI18n: { vi: 'Cục Thể dục Thể thao Việt Nam', en: 'Sports Authority of Vietnam', ko: '베트남 체육국' },
  displayId: 'SAV', shortName: 'SAV', status: 'ACTIVE',
});
console.log('  Cục TDTT');

const voc = await createOrg({
  parentId: sav.id, levelType: 'NOC',
  nameI18n: { vi: 'Ủy ban Olympic Việt Nam', en: 'Vietnam Olympic Committee', ko: '베트남올림픽위원회' },
  displayId: 'VOC', shortName: 'VOC', status: 'ACTIVE',
});
console.log('  VOC');

// 베트남 전종목 (문서 16, SEA Games 31 40종목 + 전통·e스포츠 기반).
// [단체코드, 단체명(vi), 단체명(ko), 종목코드, 종목명(vi), 정렬, 올림픽, SEA게임, 성/시연맹생성]
// 종목·단체 목록은 데이터다 — 문체부 정식 명단(VOC 회원) 수령 시 이 배열만 교체한다.
// 성/시 연맹은 지금 1군에만 붙여 등록 구조를 보인다. 전 종목·34개 성/시 확산은 데이터 단계(이후).
const feds = [
  // 1군 — 인기·전략 (성/시 연맹 생성)
  ['FED-FTB', 'Liên đoàn Bóng đá Việt Nam', '베트남 축구연맹', 'FOOTBALL', 'Bóng đá', 10, true, true, true],
  ['FED-VOL', 'Liên đoàn Bóng chuyền Việt Nam', '베트남 배구연맹', 'VOLLEYBALL', 'Bóng chuyền', 20, true, true, true],
  ['FED-ATH', 'Liên đoàn Điền kinh Việt Nam', '베트남 육상연맹', 'ATHLETICS', 'Điền kinh', 30, true, true, true],
  ['FED-SWI', 'Hiệp hội Thể thao dưới nước Việt Nam', '베트남 수영협회', 'SWIMMING', 'Bơi lội', 40, true, true, true],
  ['FED-BAD', 'Liên đoàn Cầu lông Việt Nam', '베트남 배드민턴연맹', 'BADMINTON', 'Cầu lông', 50, true, true, true],
  ['FED-TKD', 'Liên đoàn Taekwondo Việt Nam', '베트남 태권도연맹', 'TAEKWONDO', 'Taekwondo', 60, true, true, true],
  ['FED-VOV', 'Liên đoàn Vovinam Việt Nam', '베트남 보비남연맹', 'VOVINAM', 'Vovinam', 70, false, true, true],
  ['FED-BKB', 'Liên đoàn Bóng rổ Việt Nam', '베트남 농구연맹', 'BASKETBALL', 'Bóng rổ', 80, true, true, true],
  ['FED-ESP', 'Hội Thể thao điện tử giải trí Việt Nam', '베트남 e스포츠협회', 'ESPORTS', 'Thể thao điện tử', 90, false, true, true],
  // 2군 — 올림픽·정규
  ['FED-TTN', 'Liên đoàn Bóng bàn Việt Nam', '베트남 탁구연맹', 'TABLE_TENNIS', 'Bóng bàn', 100, true, true, false],
  ['FED-TEN', 'Liên đoàn Quần vợt Việt Nam', '베트남 테니스연맹', 'TENNIS', 'Quần vợt', 105, true, true, false],
  ['FED-BOX', 'Liên đoàn Quyền Anh Việt Nam', '베트남 복싱연맹', 'BOXING', 'Quyền anh', 110, true, true, false],
  ['FED-JUD', 'Liên đoàn Judo Việt Nam', '베트남 유도연맹', 'JUDO', 'Judo', 115, true, true, false],
  ['FED-WRE', 'Liên đoàn Vật Việt Nam', '베트남 레슬링연맹', 'WRESTLING', 'Vật', 120, true, true, false],
  ['FED-WLF', 'Liên đoàn Cử tạ Việt Nam', '베트남 역도연맹', 'WEIGHTLIFTING', 'Cử tạ', 125, true, true, false],
  ['FED-ARC', 'Liên đoàn Bắn cung Việt Nam', '베트남 양궁연맹', 'ARCHERY', 'Bắn cung', 130, true, true, false],
  ['FED-SHO', 'Liên đoàn Bắn súng Việt Nam', '베트남 사격연맹', 'SHOOTING', 'Bắn súng', 135, true, true, false],
  ['FED-FEN', 'Liên đoàn Đấu kiếm Việt Nam', '베트남 펜싱연맹', 'FENCING', 'Đấu kiếm', 140, true, true, false],
  ['FED-CYC', 'Liên đoàn Xe đạp - Mô tô thể thao Việt Nam', '베트남 사이클연맹', 'CYCLING', 'Xe đạp', 145, true, true, false],
  ['FED-ROW', 'Liên đoàn Đua thuyền Việt Nam', '베트남 조정·카누연맹', 'ROWING', 'Đua thuyền', 150, true, true, false],
  ['FED-GYM', 'Liên đoàn Thể dục Việt Nam', '베트남 체조연맹', 'GYMNASTICS', 'Thể dục dụng cụ', 160, true, true, false],
  ['FED-HBL', 'Liên đoàn Bóng ném Việt Nam', '베트남 핸드볼연맹', 'HANDBALL', 'Bóng ném', 165, true, true, false],
  ['FED-TRI', 'Liên đoàn Ba môn phối hợp Việt Nam', '베트남 트라이애슬론연맹', 'TRIATHLON', 'Ba môn phối hợp', 170, true, true, false],
  ['FED-BSB', 'Liên đoàn Bóng chày và Bóng mềm Việt Nam', '베트남 야구연맹', 'BASEBALL', 'Bóng chày', 175, false, true, false],
  ['FED-KAR', 'Liên đoàn Karate Việt Nam', '베트남 가라테연맹', 'KARATE', 'Karate', 180, false, true, false],
  // 3군 — 지역·무예·마인드
  ['FED-SIL', 'Liên đoàn Pencak Silat Việt Nam', '베트남 펜칵실랏연맹', 'PENCAK_SILAT', 'Pencak Silat', 200, false, true, false],
  ['FED-STK', 'Liên đoàn Cầu mây Việt Nam', '베트남 세팍타크로연맹', 'SEPAKTAKRAW', 'Cầu mây', 205, false, true, false],
  ['FED-WUS', 'Liên đoàn Wushu Việt Nam', '베트남 우슈연맹', 'WUSHU', 'Wushu', 210, false, true, false],
  ['FED-MUA', 'Liên đoàn Muay Việt Nam', '베트남 무에타이연맹', 'MUAYTHAI', 'Muay', 215, false, true, false],
  ['FED-KIC', 'Liên đoàn Kickboxing Việt Nam', '베트남 킥복싱연맹', 'KICKBOXING', 'Kickboxing', 220, false, true, false],
  ['FED-KUR', 'Liên đoàn Kurash Việt Nam', '베트남 쿠라시연맹', 'KURASH', 'Kurash', 225, false, true, false],
  ['FED-JIU', 'Liên đoàn Jujitsu Việt Nam', '베트남 주짓수연맹', 'JUJITSU', 'Jujitsu', 230, false, true, false],
  ['FED-CHE', 'Liên đoàn Cờ Việt Nam', '베트남 체스연맹', 'CHESS', 'Cờ vua', 235, false, true, false],
  ['FED-XIA', 'Liên đoàn Cờ tướng Việt Nam', '베트남 샹치연맹', 'XIANGQI', 'Cờ tướng', 240, false, true, false],
  ['FED-BIL', 'Liên đoàn Billiards & Snooker Việt Nam', '베트남 당구연맹', 'BILLIARDS', 'Bi-a', 245, false, true, false],
  ['FED-BWL', 'Liên đoàn Bowling Việt Nam', '베트남 볼링연맹', 'BOWLING', 'Bowling', 250, false, true, false],
  ['FED-DAN', 'Liên đoàn Khiêu vũ Thể thao Việt Nam', '베트남 댄스스포츠연맹', 'DANCESPORT', 'Khiêu vũ thể thao', 255, false, true, false],
  ['FED-BBD', 'Liên đoàn Thể hình Việt Nam', '베트남 보디빌딩연맹', 'BODYBUILDING', 'Thể hình', 260, false, true, false],
  ['FED-PET', 'Liên đoàn Bi sắt Việt Nam', '베트남 페탕크연맹', 'PETANQUE', 'Bi sắt', 265, false, true, false],
  ['FED-GLF', 'Hiệp hội Golf Việt Nam', '베트남 골프협회', 'GOLF', 'Golf', 270, true, true, false],
  ['FED-FIN', 'Liên đoàn Lặn Việt Nam', '베트남 핀수영연맹', 'FINSWIMMING', 'Lặn', 275, false, true, false],
  // 4군 — 베트남 전통
  ['FED-DCU', 'Liên đoàn Đá cầu Việt Nam', '베트남 다카오연맹', 'DACAU', 'Đá cầu', 300, false, true, false],
  ['FED-VCT', 'Liên đoàn Võ thuật cổ truyền Việt Nam', '베트남 전통무술연맹', 'VOCOTRUYEN', 'Võ cổ truyền', 305, false, false, false],
] as const;

// 성/시 단위 (2025 개편 후 provincial-level). tỉnh(성)·thành phố(시) 혼합.
// 공식 34개 성/시 코드는 문체부 수령 후 교체(문서 08). 지금은 대표 6개.
const provinces = [
  ['HN', 'Hà Nội', '하노이'],
  ['HCM', 'TP. Hồ Chí Minh', '호치민'],
  ['HP', 'Hải Phòng', '하이퐁'],
  ['DN', 'Đà Nẵng', '다낭'],
  ['NA', 'Nghệ An', '응에안'],
  ['TH', 'Thanh Hóa', '타인호아'],
] as const;

for (const [code, viName, koName, sportCode, sportVi, sortOrder, isOlympic, isSeagames, withProv] of feds) {
  const fed = await createOrg({
    parentId: voc.id, levelType: 'NATIONAL_FED',
    nameI18n: { vi: viName, ko: koName }, displayId: code, status: 'ACTIVE',
  });

  await query(
    `INSERT INTO sport.sport (code, name_i18n, governing_org_id, is_olympic, is_seagames, sort_order)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6)
     ON CONFLICT (code) DO NOTHING`,
    [sportCode, JSON.stringify({ vi: sportVi, ko: koName.replace('베트남 ', '').replace('연맹', '').replace('협회', '') }),
     fed.id, isOlympic, isSeagames, sortOrder]
  );

  if (withProv) {
    for (const [pCode, pVi, pKo] of provinces) {
      await createOrg({
        parentId: fed.id, levelType: 'PROVINCE_FED',
        nameI18n: { vi: `${viName.replace('Liên đoàn ', 'LĐ ').replace('Hiệp hội ', 'HH ').replace('Hội ', 'Hội ').replace(' Việt Nam', '')} ${pVi}`,
                    ko: `${pKo} ${koName.replace('베트남 ', '')}` },
        displayId: `${code}-${pCode}`, regionCode: pCode, status: 'ACTIVE',
      });
    }
  }
  console.log(`  ${viName}${withProv ? ` (+ ${provinces.length}개 성/시 연맹)` : ''}`);
}

const counts = await query<{ orgs: number; sports: number }>(
  `SELECT (SELECT count(*)::int FROM core.organization) AS orgs,
          (SELECT count(*)::int FROM sport.sport) AS sports`
);
console.log(`\n조직 ${counts[0].orgs}개, 종목 ${counts[0].sports}개 생성 완료.\n`);

await closePool();
