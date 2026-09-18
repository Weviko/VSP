/**
 * 엑셀 일괄 등록 검증.
 *
 * 온보딩의 핵심 — 명단 엑셀을 올려 검증(필수·형식·중복) 후 사람이 확정 등록.
 * 확인:
 *   - 필수(이름)·형식(성별·날짜)·중복(파일 내 DUP_FILE / DB DUP_DB)을 잡는다
 *   - 검증은 아무것도 저장하지 않고, 확정만 유효 행을 넣는다(자동 등록 없음)
 *   - CCCD 는 원문이 아니라 해시로 저장한다(중복만 잡고 원문은 안 남긴다)
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage-test';

import {
  query, queryOne, closePool, uploadAttachment,
  parsePersonWorkbook, validatePersonRows, validateImportAttachment, commitPersonImport,
  searchPersons, getPerson, updatePerson, deactivatePerson, reactivatePerson,
  type UUID,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

async function cleanup() {
  await query(`DELETE FROM core.person WHERE external_ids->>'import' IS NOT NULL AND full_name LIKE 'IMPTEST %'`).catch(() => {});
  await query(`DELETE FROM core.attachment WHERE file_name = 'imp-test.xlsx'`).catch(() => {});
}
await cleanup();

const ExcelJS = (await import('exceljs')).default;
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('VDV');
ws.addRow(['Họ và tên', 'Tên Latin', 'Giới tính', 'Ngày sinh', 'SĐT', 'CCCD', 'Ghi chú']);
ws.addRow(['IMPTEST A', 'IMPTEST A', 'M', '2001-05-12', '0900000010', 'IMPTESTCCCD1', '']); // 유효
ws.addRow(['', 'X', 'F', '', '', '', '']);                        // REQUIRED_NAME
ws.addRow(['IMPTEST B', '', 'XYZ', '2000-01-01', '', '', '']);    // BAD_GENDER
ws.addRow(['IMPTEST C', '', 'F', 'not-a-date', '', '', '']);      // BAD_DATE
ws.addRow(['IMPTEST D', '', 'M', '1999-09-09', '', 'IMPTESTCCCD1', '']); // DUP_FILE (A 와 같은 CCCD)
const buf = Buffer.from(await wb.xlsx.writeBuffer());

console.log('\n[1] 파싱·검증 (저장 없음)');
const rows = await parsePersonWorkbook(buf);
check('데이터 5행 파싱(헤더 제외)', rows.length === 5, String(rows.length));
const v = await validatePersonRows(rows);
check('유효 1 / 오류 4', v.valid === 1 && v.errors === 4, `valid=${v.valid} err=${v.errors}`);
const codes = new Set(v.rows.flatMap((r) => r.errors));
check('필수·성별·날짜·파일중복 코드 감지',
  ['REQUIRED_NAME', 'BAD_GENDER', 'BAD_DATE', 'DUP_FILE'].every((c) => codes.has(c)), [...codes].join(','));

console.log('\n[2] 확정 등록 (유효 행만)');
const owner = await queryOne<{ id: UUID }>(`SELECT id FROM core.person LIMIT 1`);
const att = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: owner!.id, fileName: 'imp-test.xlsx', data: buf,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uploadedBy: owner!.id,
});
const attCheck = await validateImportAttachment(att.id);
check('첨부에서 검증도 동일', attCheck.valid === 1 && attCheck.errors === 4);
const res = await commitPersonImport(att.id, { personId: owner!.id });
check('등록 1 · 건너뜀 4', res.inserted === 1 && res.skipped === 4, `ins=${res.inserted} skip=${res.skipped}`);
const p = await queryOne<{ h: string | null }>(
  `SELECT id_doc_hash AS h FROM core.person WHERE full_name = 'IMPTEST A' AND external_ids->>'import' IS NOT NULL`
);
check('등록된 사람 존재', p !== null);
check('CCCD 는 해시(64자)로만 저장', Boolean(p?.h) && p!.h!.length === 64);

console.log('\n[3] 재실행 시 DB 중복 감지');
const again = await validateImportAttachment(att.id);
check('이미 등록된 CCCD → DUP_DB', again.rows.some((r) => r.errors.includes('DUP_DB')));

console.log('\n[4] 사람 검색 선택기 backend (searchPersons)');
const hits = await searchPersons('IMPTEST', { limit: 10 });
check('이름으로 검색됨', hits.some((p) => p.full_name === 'IMPTEST A'));
check('결과에 신분증 원문 없음(연도만)', hits.every((p) => !('cccd' in p) && !('id_doc_no' in p)));
check('2글자 미만은 빈 결과(전체 긁기 방지)', (await searchPersons('a')).length === 0);

console.log('\n[5] 인물 조회·수정·비활성 (CRUD 완결)');
const target = hits.find((p) => p.full_name === 'IMPTEST A')!;
const rec = await getPerson(target.id as UUID);
check('개별 조회', rec?.full_name === 'IMPTEST A');
const upd = await updatePerson(target.id as UUID, { phone: '0999999999', name_latin: 'IMPTEST A LATIN' }, { personId: owner!.id });
check('수정 반영', upd.phone === '0999999999' && upd.name_latin === 'IMPTEST A LATIN');
check('수정은 감사기록에 남는다',
  (await query(`SELECT 1 FROM core.audit_log WHERE entity_table='person' AND action='UPDATE'`)).length > 0);
await deactivatePerson(target.id as UUID, { personId: owner!.id });
check('비활성 후 검색에서 제외', !(await searchPersons('IMPTEST')).some((p) => p.id === target.id));
check('비활성 인물도 개별 조회는 된다(되살리기 위해)', (await getPerson(target.id as UUID))?.deleted_at !== null);
await reactivatePerson(target.id as UUID, { personId: owner!.id });
check('되살리면 검색 복귀', (await searchPersons('IMPTEST')).some((p) => p.id === target.id));

await cleanup();
await closePool();
const { rm } = await import('node:fs/promises');
await rm('.storage-test', { recursive: true, force: true }).catch(() => {});

console.log(failed === 0
  ? '\n엑셀 명단을 검증하고, 사람이 확정한 유효 행만 등록된다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
