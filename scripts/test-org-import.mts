/**
 * 조직 일괄 등록 검증.
 *
 * 온보딩 — MCST 공식 조직 목록 엑셀을 올려 검증(필수·유효레벨·중복·상위참조) 후 사람이 확정.
 * 확인:
 *   - 필수(코드·이름)·유효 레벨·중복(DUP_FILE/DUP_DB)·상위참조(BAD_PARENT)를 잡는다
 *   - 검증은 아무것도 저장하지 않고, 확정만 유효 행을 넣는다(자동 등록 없음)
 *   - 상위 → 하위 위상 정렬: 하위가 파일에서 상위보다 "먼저" 나와도 부모로 올바르게 연결된다
 *   - 재실행 시 이미 있는 display_id 는 DUP_DB 로 걸린다
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage-test-org';

import {
  query, queryOne, closePool, uploadAttachment,
  parseOrgWorkbook, validateOrgRows, validateOrgImportAttachment, commitOrgImport,
  type UUID,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

async function cleanup() {
  // 하위(부모참조 있는 것) 먼저 지운다 — parent_id 는 RESTRICT
  await query(`DELETE FROM core.organization WHERE display_id LIKE 'OT-%' AND parent_id IS NOT NULL`).catch(() => {});
  await query(`DELETE FROM core.organization WHERE display_id LIKE 'OT-%'`).catch(() => {});
  await query(`DELETE FROM core.attachment WHERE file_name = 'org-imp-test.xlsx'`).catch(() => {});
}
await cleanup();

const ExcelJS = (await import('exceljs')).default;
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('DonVi');
ws.addRow(['Mã đơn vị', 'Tên đơn vị', 'Tên EN', 'Tên KO', 'Loại cấp', 'Mã cấp trên', 'Mã vùng', 'Viết tắt', 'ĐT', 'Email']);
// 하위(OT-HN)가 상위(OT-FED)보다 먼저 온다 — 위상 정렬 검증
ws.addRow(['OT-HN', 'OT Hà Nội TKD', '', '', 'PROVINCE_FED', 'OT-FED', 'HN', '', '', '']);   // 유효(하위)
ws.addRow(['OT-FED', 'OT Liên đoàn TKD', 'OT Fed EN', 'OT 연맹', 'NATIONAL_FED', '', '', 'OTF', '', '']); // 유효(상위)
ws.addRow(['', 'OT No Id', '', '', 'NATIONAL_FED', '', '', '', '', '']);                     // REQUIRED_ID
ws.addRow(['OT-BAD', 'OT Bad Level', '', '', 'NOT_A_LEVEL', '', '', '', '', '']);            // BAD_LEVEL
ws.addRow(['OT-HN', 'OT Dup', '', '', 'PROVINCE_FED', 'OT-FED', '', '', '', '']);            // DUP_FILE
ws.addRow(['OT-ORPHAN', 'OT Orphan', '', '', 'PROVINCE_FED', 'OT-NOPE', '', '', '', '']);    // BAD_PARENT
const buf = Buffer.from(await wb.xlsx.writeBuffer());

console.log('\n[1] 파싱·검증 (저장 없음)');
const rows = await parseOrgWorkbook(buf);
check('데이터 6행 파싱(헤더 제외)', rows.length === 6, String(rows.length));
const v = await validateOrgRows(rows);
check('유효 2 / 오류 4', v.valid === 2 && v.errors === 4, `valid=${v.valid} err=${v.errors}`);
const codes = new Set(v.rows.flatMap((r) => r.errors));
check('필수코드·유효레벨·파일중복·상위참조 감지',
  ['REQUIRED_ID', 'BAD_LEVEL', 'DUP_FILE', 'BAD_PARENT'].every((c) => codes.has(c)), [...codes].join(','));

console.log('\n[2] 확정 등록 (유효 행만) — 위상 정렬');
const owner = await queryOne<{ id: UUID }>(`SELECT id FROM core.person LIMIT 1`);
const att = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: owner!.id, fileName: 'org-imp-test.xlsx', data: buf,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uploadedBy: owner!.id,
});
const attCheck = await validateOrgImportAttachment(att.id);
check('첨부에서 검증도 동일', attCheck.valid === 2 && attCheck.errors === 4);
const res = await commitOrgImport(att.id, { personId: owner!.id });
check('등록 2 · 건너뜀 4', res.inserted === 2 && res.skipped === 4, `ins=${res.inserted} skip=${res.skipped}`);

const parent = await queryOne<{ id: UUID }>(`SELECT id FROM core.organization WHERE display_id = 'OT-FED'`);
const child = await queryOne<{ parent_id: UUID | null; ko: string | null }>(
  `SELECT parent_id, name_i18n->>'ko' AS ko FROM core.organization WHERE display_id = 'OT-HN'`
);
check('상위·하위 모두 등록', Boolean(parent && child));
check('하위가 상위보다 먼저 나와도 부모로 연결됨', child?.parent_id === parent?.id);
check('한국어 이름 저장(다국어)', (await queryOne<{ ko: string | null }>(
  `SELECT name_i18n->>'ko' AS ko FROM core.organization WHERE display_id = 'OT-FED'`))?.ko === 'OT 연맹');

console.log('\n[3] 재실행 시 DB 중복 감지');
const again = await validateOrgImportAttachment(att.id);
check('이미 등록된 display_id → DUP_DB', again.rows.some((r) => r.errors.includes('DUP_DB')));

await cleanup();
await closePool();
const { rm } = await import('node:fs/promises');
await rm('.storage-test-org', { recursive: true, force: true }).catch(() => {});

console.log(failed === 0
  ? '\n조직 엑셀을 검증하고, 사람이 확정한 유효 행만 상위→하위 순서로 등록된다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
