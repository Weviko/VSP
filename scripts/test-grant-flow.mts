/**
 * 보조금 전 주기 + 기관 간 공문 검증.
 *
 * 문체부 미팅에서 가장 먼저 나올 질문이 "돈이 어디로 갔는지 추적되는가"이다.
 * 그래서 중앙 → 지방 → 단체로 재교부되는 계층과, 초과 교부·초과 집행·중복 증빙을
 * 실제로 막는지 확인한다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import {
  query, queryOne, closePool, createOrganization,
  createProgram, setProgramStatus, applyToProgram, listApplications,
  decideAward, listAwards, getAwardChain, recordExecution,
  getExecutionByFundSource, submitSettlement, inspectSettlement, listDisclosures,
  OverAwardError, OverExecutionError, DuplicateEvidenceError,
  sendDocument, receiveDocument, listInbox, listOutbox,
  requestConcurrence, respondConcurrence, listConcurrenceRequests,
  listRegister, grantDocumentAccess,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}
async function expectReject(name: string, fn: () => Promise<unknown>, type?: new (...a: never[]) => Error) {
  let caught: unknown = null;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  const ok = type ? caught instanceof type : caught !== null;
  check(name, ok, caught ? String(caught) : 'did not throw');
}

// 반복 실행을 위해 이 테스트가 만드는 데이터만 비운다
await query(`TRUNCATE grant_mgmt.disclosure, grant_mgmt.inspection, grant_mgmt.settlement,
             grant_mgmt.execution, grant_mgmt.budget_item, grant_mgmt.award,
             grant_mgmt.application, grant_mgmt.program RESTART IDENTITY CASCADE`);
await query(`TRUNCATE core.document_register, core.document_access,
             core.document_concurrence, core.dispatch RESTART IDENTITY CASCADE`);

console.log('\n[1] 조직 준비 (부처 → 체육회 → 협회)');
async function orgByCode(code: string, level: string, name: string, parentId?: string) {
  const found = await queryOne<{ id: string }>(
    `SELECT id FROM core.organization WHERE display_id = $1`, [code]
  );
  if (found) return found.id;
  const created = await createOrganization({
    parentId: parentId ?? null, levelType: level,
    nameI18n: { vi: name }, displayId: code, status: 'ACTIVE',
  });
  return created.id;
}
const ministry = await orgByCode('MOCST', 'MINISTRY', 'Bo VHTTDL');
const noc = await orgByCode('VOC-T', 'NOC', 'Uy ban Olympic', ministry);
const fed = await orgByCode('FED-T', 'NATIONAL_FED', 'Lien doan test', noc);
check('3단계 조직 준비', Boolean(ministry && noc && fed));

console.log('\n[2] 공모 등록 → 신청 → 선정');
const program = await createProgram({
  code: 'PRG-TEST-2026',
  nameI18n: { vi: 'Ho tro the thao 2026', ko: '2026 체육 지원사업' },
  ownerOrgId: ministry,
  fiscalYear: 2026,
  totalBudget: 1_000_000_000,
  appliesFrom: '2026-01-01',
  appliesTo: '2026-02-28',
});
check('공모 생성 (DRAFT)', program.status === 'DRAFT');
await setProgramStatus(program.id, 'OPEN');

await applyToProgram({
  programId: program.id, applicantOrgId: noc,
  requestedAmount: 600_000_000, selfFunding: 100_000_000, summary: 'Test',
});
const apps = await listApplications(program.id);
check('신청 1건 접수', apps.length === 1, String(apps.length));
check('신청액 기록', Number(apps[0].requested_amount) === 600_000_000);

console.log('\n[3] 교부 결정 — 중앙에서 체육회로');
const topAward = await decideAward({
  programId: program.id,
  applicationId: apps[0].id,
  granteeOrgId: noc,
  decisionNo: '01/QD-MOCST',
  awardedAmount: 600_000_000,
  selfFunding: 100_000_000,
  dedicatedAccount: '0123456789',
  settlementDueOn: '2027-01-31',
});
check('교부 결정 생성', topAward.status === 'DECIDED');
check('전용계좌 기록', topAward.dedicated_account === '0123456789');
check('신청이 SELECTED 로 전환',
  (await listApplications(program.id))[0].status === 'SELECTED');

console.log('\n[4] 재교부 — 체육회에서 협회로');
const subAward = await decideAward({
  programId: program.id,
  parentAwardId: topAward.id,
  granteeOrgId: fed,
  decisionNo: '05/QD-VOC',
  awardedAmount: 400_000_000,
  settlementDueOn: '2026-12-31',
});
check('재교부 생성', subAward.parent_award_id === topAward.id);

// 상위 교부액을 넘는 재교부는 막아야 한다
await expectReject(
  '상위 교부액 초과 재교부 차단',
  () => decideAward({
    programId: program.id, parentAwardId: topAward.id,
    granteeOrgId: fed, awardedAmount: 300_000_000,
  }),
  OverAwardError
);

console.log('\n[5] 교부 계층 추적');
const chain = await getAwardChain(topAward.id);
check('계층 2단계 조회', chain.length === 2, String(chain.length));
check('상위가 depth 0', chain[0].depth === 0);
check('하위가 depth 1', chain[1].depth === 1);

console.log('\n[6] 집행 — 재원 구분');
await recordExecution({
  awardId: subAward.id, executedOn: '2026-03-10',
  amount: 150_000_000, fundSource: 'STATE_BUDGET',
  payee: 'Cong ty A', description: 'Thue san', evidenceNo: 'INV-001',
});
await recordExecution({
  awardId: subAward.id, executedOn: '2026-04-02',
  amount: 100_000_000, fundSource: 'STATE_BUDGET',
  payee: 'Cong ty B', evidenceNo: 'INV-002',
});
const byFund = await getExecutionByFundSource(subAward.id);
check('재원별 집계', byFund.length === 1 && byFund[0].fund_source === 'STATE_BUDGET');
check('집행 합계 250,000,000', Number(byFund[0].executed) === 250_000_000, byFund[0].executed);

// 교부액 초과 집행은 막아야 한다
await expectReject(
  '교부액 초과 집행 차단',
  () => recordExecution({
    awardId: subAward.id, executedOn: '2026-05-01',
    amount: 200_000_000, fundSource: 'STATE_BUDGET',
  }),
  OverExecutionError
);

// 같은 증빙을 다른 교부건에 쓰는 중복 수급은 막아야 한다
await expectReject(
  '중복 증빙 차단 (부정수급)',
  () => recordExecution({
    awardId: topAward.id, executedOn: '2026-05-01',
    amount: 10_000_000, fundSource: 'STATE_BUDGET', evidenceNo: 'INV-001',
  }),
  DuplicateEvidenceError
);

console.log('\n[7] 집행률 표시');
const awards = await listAwards({ granteeOrgId: fed });
check('집행률 계산', awards[0].execution_rate === 63, String(awards[0].execution_rate));

console.log('\n[8] 정산 → 검사 → 공시');
const settle = await submitSettlement(subAward.id, { returnedAmount: 150_000_000 });
check('집행액을 시스템이 계산', settle.executed === 250_000_000, String(settle.executed));
check('잔액 계산', settle.remaining === 150_000_000, String(settle.remaining));

await inspectSettlement(subAward.id, { result: 'PASS', findings: 'No issue' });
const closed = await queryOne<{ status: string }>(
  `SELECT status FROM grant_mgmt.award WHERE id=$1`, [subAward.id]
);
check('검사 통과 시 교부건 종결', closed?.status === 'CLOSED', closed?.status);

const disc = await listDisclosures(2026);
check('공시 생성', disc.length === 1, String(disc.length));
check('공시에 집행액 포함', Number(disc[0].summary.executed) === 250_000_000);

console.log('\n[9] 기관 간 공문 — 시행과 접수');
const doc = await queryOne<{ id: string }>(
  `INSERT INTO core.document (doc_no, from_org_id, title, doc_type, confidentiality)
   VALUES ('MOCST-2026-0001', $1, 'Thong bao ho tro 2026', 'OFFICIAL_LETTER', 'INTERNAL')
   RETURNING id`,
  [ministry]
);
const sent = await sendDocument({
  documentId: doc!.id, fromOrgId: ministry,
  toOrgIds: [noc], ccOrgIds: [fed], replyDueOn: '2026-03-01',
});
check('수신처 2곳 발송', sent.dispatched === 2, String(sent.dispatched));
check('생산 대장 번호 발번', sent.registerNo.startsWith('MOCST-'), sent.registerNo);

const inbox = await listInbox(noc);
check('받은 공문함에 도착', inbox.length === 1);
check('발신 기관명 표시', Boolean(inbox[0].from_org_name));

const person = await queryOne<{ id: string }>(`SELECT id FROM core.person LIMIT 1`);
const recv = await receiveDocument(inbox[0].id, { personId: person!.id, orgId: noc });
check('접수번호 발번', recv.receiptNo.startsWith('VOC-T-'), recv.receiptNo);
check('상태가 RECEIVED', (await listInbox(noc))[0].status === 'RECEIVED');

const outbox = await listOutbox(ministry);
check('보낸 공문함 조회', outbox.length === 2, String(outbox.length));

console.log('\n[10] 열람 범위와 대장');
await grantDocumentAccess(doc!.id, { orgId: fed }, { personId: person!.id });
const access = await query(`SELECT 1 FROM core.document_access WHERE document_id=$1`, [doc!.id]);
check('열람범위 2건 (접수자 + 지정)', access.length === 2, String(access.length));

const produced = await listRegister(ministry, 'PRODUCED');
const received = await listRegister(noc, 'RECEIVED');
check('생산 대장 1건', produced.length === 1);
check('접수 대장 1건', received.length === 1);

console.log('\n[11] 합의(협조)');
await requestConcurrence(doc!.id, [fed]);
const reqs = await listConcurrenceRequests(fed);
check('합의 요청 도착', reqs.length === 1);
await respondConcurrence(reqs[0].id, 'DISAGREED', { personId: person!.id, orgId: fed }, 'Can xem lai');
const after = await queryOne<{ status: string; opinion: string | null }>(
  `SELECT status, opinion FROM core.document_concurrence WHERE id=$1`, [reqs[0].id]
);
check('반대 의견도 기록된다', after?.status === 'DISAGREED' && after.opinion === 'Can xem lai');

console.log('\n[12] 감사 추적');
const actions = await query<{ action: string }>(
  `SELECT action FROM core.audit_log WHERE entity_schema IN ('grant_mgmt','core')
    AND action IN ('AWARD','EXECUTE','SETTLE','INSPECT','DISPATCH','RECEIVE','DISAGREED')`
);
const set = new Set(actions.map((a) => a.action));
for (const a of ['AWARD', 'EXECUTE', 'SETTLE', 'INSPECT', 'DISPATCH', 'RECEIVE', 'DISAGREED']) {
  check(`${a} 기록됨`, set.has(a));
}

await closePool();
console.log(failed === 0
  ? '\n보조금 전 주기와 기관 간 공문이 끝까지 동작한다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
