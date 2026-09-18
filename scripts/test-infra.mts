/**
 * 인프라 검증 — 파일 저장 · 엑셀 · 알림.
 *
 * 이 셋은 "있는 줄 알았는데 없어서" 실무가 막히는 대표적인 부분이다.
 * 첨부가 안 되면 등록이 반쪽이고, 엑셀이 없으면 감사에 제출할 수 없고,
 * 알림이 없으면 기한을 아무도 모른다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage-test';

import {
  query, queryOne, closePool,
  uploadAttachment, listAttachments, readAttachment, deleteAttachment, UploadError,
  buildWorkbook, sheet, exportFileName, MONEY_FMT,
  queueNotification, flushNotifications, registerAdapter, renderTemplate,
  queueDeadlineReminders, getNotificationSummary, listRecentNotifications,
  type UUID,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}
async function expectReject(name: string, fn: () => Promise<unknown>, code?: string) {
  let caught: unknown = null;
  try { await fn(); } catch (e) { caught = e; }
  const ok = code
    ? caught instanceof UploadError && caught.code === code
    : caught !== null;
  check(name, ok, caught ? String(caught) : 'did not throw');
}

const org = await queryOne<{ id: UUID }>(`SELECT id FROM core.organization LIMIT 1`);
if (!org) {
  console.log('조직 데이터가 필요합니다. npm run demo 를 먼저 실행하세요.');
  process.exit(1);
}

console.log('\n[1] 파일 저장');
// 지난 실행이 남긴 레코드를 지운다. 남아 있으면 중복 제거가 이미 사라진 파일을 가리킨다.
await query(
  `DELETE FROM core.attachment WHERE file_name IN ('giay-phep.pdf','giay-phep-copy.pdf')`
);
const pdf = Buffer.from('%PDF-1.4 fake content for test');
const up = await uploadAttachment({
  ownerType: 'ORG', ownerId: org.id,
  fileName: 'giay-phep.pdf', data: pdf, mimeType: 'application/pdf',
});
check('업로드 성공', Boolean(up.id));
check('크기 기록', up.size_bytes === pdf.length);
check('체크섬 기록', Boolean(up.checksum));
check('저장 키가 날짜로 나뉨', /^org\/\d{4}\/\d{2}\/\d{2}\//.test(up.storage_key), up.storage_key);

const back = await readAttachment(up.id);
check('내용이 그대로 돌아옴', back?.data.equals(pdf) === true);
check('파일명 보존 (베트남어)', back?.meta.file_name === 'giay-phep.pdf');

// 같은 파일을 다시 올리면 저장소에는 한 번만 쓴다
const up2 = await uploadAttachment({
  ownerType: 'SUBMISSION', ownerId: org.id,
  fileName: 'giay-phep-copy.pdf', data: pdf, mimeType: 'application/pdf',
});
check('같은 내용이면 저장 키 재사용', up2.storage_key === up.storage_key);
check('레코드는 별도로 생김', up2.id !== up.id);

await expectReject('실행 파일 차단', () =>
  uploadAttachment({
    ownerType: 'ORG', ownerId: org.id,
    fileName: 'hack.exe', data: Buffer.from('MZ'),
  }), 'BAD_TYPE');

await expectReject('빈 파일 차단', () =>
  uploadAttachment({
    ownerType: 'ORG', ownerId: org.id,
    fileName: 'empty.pdf', data: Buffer.alloc(0),
  }), 'EMPTY');

const listed = await listAttachments('ORG', org.id);
check('목록 조회', listed.some((a) => a.id === up.id));

await deleteAttachment(up.id);
const afterDelete = await listAttachments('ORG', org.id);
check('삭제 후 목록에서 빠짐', !afterDelete.some((a) => a.id === up.id));
// 같은 파일을 참조하는 다른 레코드가 있으므로 실제 파일은 남아 있어야 한다
const still = await readAttachment(up2.id);
check('다른 레코드의 파일은 살아 있음', still?.data.equals(pdf) === true);

// 저장소에서 파일만 사라진 상태(부분 복구·저장소 이전)에서도 다시 올리면 복구되어야 한다.
// 레코드만 믿고 중복 제거를 하면 그 뒤로 올라온 사본이 전부 열리지 않는다.
const { unlink } = await import('node:fs/promises');
const { resolve } = await import('node:path');
await unlink(resolve('.storage-test', up2.storage_key));
check('파일이 사라지면 읽기 실패', await readAttachment(up2.id).then(() => false, () => true));
const up3 = await uploadAttachment({
  ownerType: 'ORG', ownerId: org.id,
  fileName: 'giay-phep.pdf', data: pdf, mimeType: 'application/pdf',
});
check('빈 키를 물려받지 않음', (await readAttachment(up3.id))?.data.equals(pdf) === true);
check('기존 레코드도 같이 복구됨', (await readAttachment(up2.id))?.data.equals(pdf) === true);

console.log('\n[2] 엑셀 내보내기');
type Row = { name: string; amount: number; date: string };
const rows: Row[] = [
  { name: 'Liên đoàn Taekwondo', amount: 400_000_000, date: '2026-03-10' },
  { name: '베트남 배구연맹', amount: 250_500_000, date: '2026-04-02' },
];
const xlsx = await buildWorkbook([
  sheet<Row>({
    name: 'Tro cap',
    title: 'Danh sách trợ cấp',
    subtitle: '2026',
    columns: [
      { header: 'Đơn vị', value: (r) => r.name, width: 30 },
      { header: 'Số tiền', value: (r) => r.amount, width: 18, numFmt: MONEY_FMT },
      { header: 'Ngày', value: (r) => r.date, width: 14 },
    ],
    rows,
  }),
]);
check('엑셀 생성', xlsx.length > 1000, `${xlsx.length} bytes`);
check('xlsx 시그니처(PK)', xlsx[0] === 0x50 && xlsx[1] === 0x4b);
check('파일명에 날짜 포함', /_\d{8}\.xlsx$/.test(exportFileName('grants')), exportFileName('grants'));

// 생성한 파일을 다시 읽어 내용이 살아 있는지 확인한다
const ExcelJS = (await import('exceljs')).default;
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(xlsx as unknown as ArrayBuffer);
const ws = wb.getWorksheet('Tro cap');
// 배치: 1 제목 · 2 부제 · 3 빈줄 · 4 머리글 · 5부터 데이터
check('시트 이름 유지', Boolean(ws));
check('제목 줄 기록', ws?.getCell(1, 1).value === 'Danh sách trợ cấp');
check('부제 줄 기록', String(ws?.getCell(2, 1).value) === '2026');
check('머리글 기록', ws?.getCell(4, 1).value === 'Đơn vị');
check('베트남어 값 보존', ws?.getCell(5, 1).value === 'Liên đoàn Taekwondo',
  String(ws?.getCell(5, 1).value));
check('한국어 값 보존', ws?.getCell(6, 1).value === '베트남 배구연맹',
  String(ws?.getCell(6, 1).value));
check('금액이 숫자로 들어감', ws?.getCell(5, 2).value === 400_000_000,
  String(ws?.getCell(5, 2).value));
check('금액 서식 적용', ws?.getCell(5, 2).numFmt === MONEY_FMT);
check('머리글 고정', ws?.views?.[0]?.state === 'frozen');

console.log('\n[3] 알림');
check('템플릿 렌더 (ko)',
  renderTemplate('SETTLEMENT_DUE', 'ko', { title: '체육지원', date: '2026-12-31' })
    === '"체육지원" 보조금 정산 기한이 2026-12-31입니다.');
check('템플릿 렌더 (vi)',
  renderTemplate('SETTLEMENT_DUE', 'vi', { title: 'Ho tro', date: '2026-12-31' })
    .includes('Ho tro'));

const person = await queryOne<{ id: UUID }>(
  `SELECT id FROM core.person WHERE phone IS NOT NULL LIMIT 1`
);
if (person) {
  await query(`DELETE FROM core.notification WHERE template_code = 'APPROVAL_PENDING'`);
  const nid = await queueNotification({
    personId: person.id, templateCode: 'APPROVAL_PENDING', vars: { n: 3 },
  });
  check('큐 적재', Boolean(nid));

  const queued = await queryOne<{ payload: { body: string; to: string | null } }>(
    `SELECT payload FROM core.notification WHERE id = $1`, [nid]
  );
  check('문구가 미리 렌더됨', Boolean(queued?.payload.body));
  check('수신 번호가 담김', queued?.payload.to !== undefined);

  // 어댑터가 없으면 실패가 아니라 건너뛴다 — 나중에 붙이면 그대로 나간다
  const before = await flushNotifications();
  check('어댑터 없으면 SKIPPED', before.skipped >= 1 && before.failed === 0,
    JSON.stringify(before));

  const sentTo: string[] = [];
  let gotCode: string | undefined;
  registerAdapter({
    channel: 'ZALO',
    async send(to, body, payload) {
      sentTo.push(`${to}:${body}`);
      gotCode = (payload as { templateCode?: string } | undefined)?.templateCode;
    },
  });
  await query(`UPDATE core.notification SET status='QUEUED' WHERE template_code='APPROVAL_PENDING'`);
  const after = await flushNotifications();
  check('어댑터 등록 후 발송', after.sent >= 1, JSON.stringify(after));
  check('어댑터가 실제로 호출됨', sentTo.length >= 1);
  check('어댑터에 알림 코드·변수 전달', gotCode === 'APPROVAL_PENDING', String(gotCode));
}

const reminders = await queueDeadlineReminders(3650);
check('기한 알림 생성', reminders >= 0, String(reminders));

const summary = await getNotificationSummary();
check('발송 현황 집계', Array.isArray(summary) && summary.length > 0);

const recent = await listRecentNotifications(10);
check('최근 알림 목록(운영 화면용)', Array.isArray(recent) && recent.length > 0);
check('목록에 채널·상태·생성시각', recent.every((r) => Boolean(r.channel && r.status && r.created_at)));

await closePool();

// 테스트가 만든 저장소는 지운다
const { rm } = await import('node:fs/promises');
await rm('.storage-test', { recursive: true, force: true }).catch(() => {});

console.log(failed === 0
  ? '\n인프라(파일·엑셀·알림)가 동작한다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
