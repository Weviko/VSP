/**
 * 통합 스모크 테스트.
 * 실제 앱 코드(core-admin)가 실제 DB에 붙어 업무 흐름을 처리하는지 확인한다.
 * 조직 생성 -> 사람 -> 권한 -> 신청서 제출 -> 2단계 결재 -> 승인 확정.
 */
// 기본은 인프로세스 PGlite. 진짜 PostgreSQL로 검증하려면 DATABASE_URL을 넘기면 된다.
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import {
  query, queryOne, execScript, closePool,
  createOrganization, getOrganization, getOrgTree, getDescendantIds, mergeOrganization,
  updateOrganization, deactivateOrganization, reactivateOrganization,
  getForm, validateSubmission, submitForm,
  startWorkflow, act, listPendingFor,
  normalizePhone, issueOtp, verifyOtpAndLogin, getCurrentUser,
  registerAdapter, AuthError,
  listSeasons, getCurrentSeason, createSeason, updateSeason, setCurrentSeason,
  listAuditLog, auditFacets,
  createPaymentOrder, confirmPaymentReturn, getPaymentOrderByNo,
  registerPaymentGateway, mockPaymentGateway,
  createPerson, searchPersons, searchOrgs, createDocument, getDocument,
  issueCertificate, verifyCertificate, revokeCertificate,
  t as pick,
} from '../packages/core-admin/src/index.ts';

/**
 * 반복 실행할 수 있도록 업무 데이터를 비운다.
 *
 * 주의: core.organization 을 TRUNCATE ... CASCADE 하면 org_id 를 외래키로 가진
 * form_definition / workflow_definition / fee_rule 까지 함께 비워진다.
 * 그래서 정리 후 시드를 다시 적용한다 (시드는 ON CONFLICT DO NOTHING 이라 멱등하다).
 */
await query(`TRUNCATE
  core.audit_log, core.session, core.otp_challenge, core.auth_throttle,
  core.account, core.org_member, core.form_submission,
  core.workflow_instance, core.workflow_action,
  core.organization, core.person,
  sport.registration, content.press_credential
  RESTART IDENTITY CASCADE`);

{
  const { readdir, readFile } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const seedDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'seed');
  for (const f of (await readdir(seedDir)).filter((x) => x.endsWith('.sql')).sort()) {
    await execScript(await readFile(join(seedDir, f), 'utf8'));
  }
}

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

console.log('\n[1] phone normalization');
check('+84 form', normalizePhone('+84912345678') === '0912345678');
check('84 form', normalizePhone('84912345678') === '0912345678');
check('0 form', normalizePhone('0912345678') === '0912345678');
check('spaces/dashes', normalizePhone('091-234 5678') === '0912345678');
check('invalid rejected', normalizePhone('123') === null);

console.log('\n[2] organization tree');
const cuc = await createOrganization({
  levelType: 'SPORTS_AUTH',
  nameI18n: { vi: 'Cục Thể dục Thể thao', en: 'Sports Authority of Vietnam', ko: '베트남 체육국' },
  displayId: 'SAV',
  status: 'ACTIVE',
});
const fed = await createOrganization({
  parentId: cuc.id,
  levelType: 'NATIONAL_FED',
  nameI18n: { vi: 'Liên đoàn Taekwondo Việt Nam', ko: '베트남 태권도연맹' },
  displayId: 'FED-TKD',
  status: 'ACTIVE',
});
const prov = await createOrganization({
  parentId: fed.id,
  levelType: 'PROVINCE_FED',
  nameI18n: { vi: 'Liên đoàn Taekwondo Hà Nội', ko: '하노이 태권도연맹' },
  displayId: 'TKD-HN',
  regionCode: 'HN',
  status: 'ACTIVE',
});
check('created 3 orgs', Boolean(cuc.id && fed.id && prov.id));
check('vietnamese name stored', pick(fed.name_i18n, 'vi').includes('Taekwondo'));
check('korean fallback works', pick(fed.name_i18n, 'ko') === '베트남 태권도연맹');

const tree = await getOrgTree({ rootId: cuc.id });
check('tree root has child', tree.length === 1 && tree[0].children.length === 1);
check('tree depth 3', tree[0].children[0].children.length === 1);

const desc = await getDescendantIds(cuc.id);
check('descendants = 3', desc.length === 3, `got ${desc.length}`);

console.log('\n[3] auth (phone OTP)');
const otp = await issueOtp('0912345678');
check('otp issued', Boolean(otp.challengeId));
check('dev code visible in dev env', typeof otp.devCode === 'string' && otp.devCode.length === 6);

// OTP 실제 발송 — 등록된 어댑터로 코드가 나가는지 (운영 병목 #1 이었다: 저장만 하고 안 보냄)
let sentTo = '', sentBody = '';
registerAdapter({ channel: 'SMS', async send(to, body) { sentTo = to; sentBody = body; } });
const otpSent = await issueOtp('0987000111', { channel: 'SMS' });
check('OTP 어댑터로 발송됨', sentTo === '0987000111', sentTo);
check('발송 본문에 발급 코드 포함', Boolean(otpSent.devCode) && sentBody.includes(otpSent.devCode!));

// 운영에서 어댑터가 없으면 크게 실패해야 한다 (조용히 성공 위장 금지)
const prevEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
let prodErr = '';
try { await issueOtp('0987000222', { channel: 'ZALO' }); }
catch (e) { prodErr = e instanceof AuthError ? e.code : 'OTHER'; }
process.env.NODE_ENV = prevEnv;
check('운영+어댑터없음 → OTP_NOT_CONFIGURED', prodErr === 'OTP_NOT_CONFIGURED', prodErr);

let wrongRejected = false;
try {
  await verifyOtpAndLogin('0912345678', '000000');
} catch {
  wrongRejected = true;
}
check('wrong code rejected', wrongRejected);

const otp2 = await issueOtp('0912345678');
const session = await verifyOtpAndLogin('0912345678', otp2.devCode!);
check('login issues session token', session.token.length > 20);

const me = await getCurrentUser(session.token);
check('session resolves to user', me?.personId === session.personId);
check('phone stored normalized', me?.phone === '0912345678');

// OTP 빈도 제한 — 실제 발송(비용)이 붙은 뒤로는 남용 차단이 필수다
console.log('\n[3b] OTP 빈도 제한(throttle)');
let phoneBlocked = false;
for (let i = 0; i < 7 && !phoneBlocked; i++) {
  try { await issueOtp('0900111222'); }
  catch (e) { if (e instanceof AuthError && e.code === 'THROTTLED') phoneBlocked = true; }
}
check('같은 번호 반복 → 번호별 한도 THROTTLED', phoneBlocked);

let ipBlocked = false;
for (let i = 0; i < 25 && !ipBlocked; i++) {
  try { await issueOtp(`09${String(10000000 + i)}`, { ip: '203.0.113.9' }); }
  catch (e) { if (e instanceof AuthError && e.code === 'THROTTLED') ipBlocked = true; }
}
check('한 IP에서 여러 번호 스프레이 → IP별 한도 THROTTLED', ipBlocked);

// 시즌(회기) — 등록은 연간 갱신제. 현재 시즌 개시가 실등록의 전제다.
console.log('\n[3c] 시즌 관리');
// 반복 실행 대비: 테스트가 만든 회기 제거 + 2026을 현재로 되돌림 (core.season 은 TRUNCATE 대상이 아니다)
await query(`DELETE FROM core.season WHERE code = '2027'`);
await query(`UPDATE core.season SET is_current = (code = '2026')`);
const cur0 = await getCurrentSeason();
check('시드 현재 시즌 = 2026', cur0?.code === '2026', cur0?.code);
const s2027 = await createSeason(
  { code: '2027', nameI18n: { vi: 'Mùa giải 2027', ko: '2027 시즌' }, startsOn: '2027-01-01', endsOn: '2027-12-31' },
  { personId: session.personId }
);
check('새 회기 생성(처음엔 현재 아님)', s2027.code === '2027' && s2027.is_current === false);
const s2027u = await updateSeason(s2027.id, { nameI18n: { vi: 'Mùa 2027 sửa', ko: '2027 수정' } }, { personId: session.personId });
check('시즌 수정 반영(코드 유지·이름 변경)', s2027u.code === '2027' && pick(s2027u.name_i18n, 'ko') === '2027 수정');
await setCurrentSeason(s2027.id, { personId: session.personId });
check('현재 시즌 전환됨', (await getCurrentSeason())?.id === s2027.id);
check('범위당 현재는 하나뿐(이전 현재 해제)', (await listSeasons()).filter((x) => x.is_current).length === 1);
// 뒤 테스트에 영향 없게 원복 (감사기록의 season INSERT 도 정리 — [6] 카운트에 안 섞이게)
await query(`DELETE FROM core.season WHERE code = '2027'`);
await query(`UPDATE core.season SET is_current = (code = '2026')`);
await query(`DELETE FROM core.audit_log WHERE entity_table = 'season'`);

// 조직 수정·비활성 (CRUD 완결). 새 조직을 만들지 않는다([6]의 INSERT=3 카운트 보존)
console.log('\n[3d] 조직 수정·비활성');
const oUpd = await updateOrganization(prov.id, { shortName: 'HN-TKD', phone: '024-9999' }, { personId: session.personId });
check('조직 수정 반영', oUpd.short_name === 'HN-TKD' && oUpd.phone === '024-9999');
check('수정 감사기록',
  (await query(`SELECT 1 FROM core.audit_log WHERE entity_table='organization' AND action='UPDATE'`)).length > 0);
let orgHasChildBlocked = false;
try { await deactivateOrganization(fed.id, { personId: session.personId }); }
catch (e) { orgHasChildBlocked = e instanceof Error && e.message === 'ORG_HAS_CHILDREN'; }
check('하위 있는 조직 비활성 차단', orgHasChildBlocked);
await deactivateOrganization(prov.id, { personId: session.personId });
check('비활성 후 기본 조회 제외', (await getOrganization(prov.id)) === null);
check('includeDeleted 로는 조회됨', (await getOrganization(prov.id, { includeDeleted: true }))?.deleted_at != null);
await reactivateOrganization(prov.id, { personId: session.personId });
check('되살리면 기본 조회 복귀', (await getOrganization(prov.id)) !== null);

// 결제 확정(게이트웨이 리턴) — 서명 검증이 곧 인증. 실패·금액불일치·위조는 확정 안 함
console.log('\n[3e] 결제 확정(게이트웨이 골격)');
registerPaymentGateway(mockPaymentGateway);
const order = await createPaymentOrder({ payeeOrgId: fed.id, payerPersonId: session.personId, amount: 30000, refType: 'REGISTRATION' });
check('주문 생성(PENDING)', order.status === 'PENDING');
check('미등록 게이트웨이 → NO_GATEWAY', (await confirmPaymentReturn('VNPAY', { vnp_TxnRef: order.order_no })).reason === 'NO_GATEWAY');
const payFail = await confirmPaymentReturn('MOCK', { order: order.order_no, amount: '30000', mock_ok: '0' });
check('결제 실패 → 확정 안 함', payFail.ok === false && payFail.reason === 'PAYMENT_FAILED');
check('실패 후 여전히 PENDING', (await getPaymentOrderByNo(order.order_no))?.status === 'PENDING');
check('금액 불일치 → 확정 안 함',
  (await confirmPaymentReturn('MOCK', { order: order.order_no, amount: '999', mock_ok: '1' })).reason === 'AMOUNT_MISMATCH');
check('유효 성공 → PAID 확정', (await confirmPaymentReturn('MOCK', { order: order.order_no, amount: '30000', mock_ok: '1' })).ok === true);
check('주문이 PAID', (await getPaymentOrderByNo(order.order_no))?.status === 'PAID');
check('재호출 멱등', (await confirmPaymentReturn('MOCK', { order: order.order_no, amount: '30000', mock_ok: '1' })).ok === true);

// 신규 폼이 부르는 backend (인물 단건 생성·조직/사람 검색·공문 기안)
console.log('\n[3f] 신규 폼 backend');
const np = await createPerson({ fullName: 'SMOKE Person X', gender: 'M', phone: '0988000111', cccd: 'SMOKECCCD1' }, { personId: session.personId });
check('인물 단건 생성', np.full_name === 'SMOKE Person X' && np.id_doc_type === 'CCCD');
check('생성 인물 검색됨', (await searchPersons('SMOKE Person')).some((p) => p.id === np.id));
check('조직 검색(이름)', (await searchOrgs('Taekwondo')).length >= 1);
const gdoc = await createDocument({ title: 'SMOKE Dispatch', body: 'noi dung', fromOrgId: fed.id }, { personId: session.personId });
check('공문 기안 생성', Boolean(gdoc.id && gdoc.doc_no));
check('공문 단건 조회', (await getDocument(gdoc.id))?.title === 'SMOKE Dispatch');

// 증명서 발급 → 진위확인 → 취소 → 취소 노출
const cert = await issueCertificate({ personId: session.personId!, orgId: fed.id, certType: 'ATHLETE_REG', title: 'SMOKE cert' }, { personId: session.personId });
const v1 = await verifyCertificate(cert.verify_code);
check('발급 직후 유효·미취소', v1.valid === true && v1.revoked === false);
await revokeCertificate(cert.id, '테스트 취소', { personId: session.personId });
const v2 = await verifyCertificate(cert.verify_code);
check('취소 후 진위확인에 revoked=true', v2.valid === true && v2.revoked === true);

console.log('\n[4] dynamic form');
const form = await getForm('ATHLETE_REG');
check('form loaded', Boolean(form));
if (!form) {
  console.log('  cannot continue without the form definition');
  await closePool();
  process.exit(1);
}
check('has 13 fields', form.fields.length === 13, `got ${form.fields.length}`);
check('legal SLA present', form.sla_days === 15);

// 첨부는 실제로 올라간 파일을 가리켜야 한다. 파일명 문자열은 빈 서류와 같다.
const PHOTO = { id: crypto.randomUUID(), name: 'a.jpg' };
check('파일명만 있으면 첨부로 인정하지 않는다',
  validateSubmission(form, { photo: 'a.jpg' }).some(
    (e) => e.field === 'photo' && e.code === 'FILE'
  ));

// 필수값 누락은 서버가 잡아야 한다 (클라이언트 검증만 믿지 않는다)
const emptyErrors = validateSubmission(form, {});
check('required fields detected', emptyErrors.length >= 7, `got ${emptyErrors.length}`);
check('all REQUIRED code', emptyErrors.every((e) => e.code === 'REQUIRED'));

// 전화번호 정규식 검증이 실제로 동작하는지
const badPhone = validateSubmission(form, {
  full_name: 'Nguyễn Văn A', gender: 'M', birth_date: '2005-03-12',
  id_doc_no: '001205000123', phone: '12345', photo: PHOTO,
  team: prov.id, discipline: 'KYORUGI',
});
check('phone pattern rejected', badPhone.some((e) => e.field === 'phone' && e.code === 'PATTERN'));

const goodData = {
  full_name: 'Nguyễn Văn A', name_latin: 'Nguyen Van A', gender: 'M',
  birth_date: '2005-03-12', id_doc_no: '001205000123', phone: '0987654321',
  photo: PHOTO, team: prov.id, discipline: 'KYORUGI',
  height_cm: 178, weight_kg: 68,
};
const clean = validateSubmission(form, goodData);
check('valid data passes', clean.length === 0, JSON.stringify(clean));

// 신장 범위 위반
const tooTall = validateSubmission(form, { ...goodData, height_cm: 400 });
check('numeric max enforced', tooTall.some((e) => e.field === 'height_cm' && e.code === 'MAX'));

console.log('\n[5] submission + workflow (2-step approval)');
const submission = await submitForm({
  formId: form.id,
  subjectType: 'PERSON',
  submitterPersonId: session.personId,
  submitterOrgId: prov.id,
  data: goodData,
});
check('submission created', submission.status === 'SUBMITTED');
check('SLA deadline auto-set', submission.due_at !== null);

const inst = await startWorkflow(submission.id, 'ATHLETE_REG', prov.id);
check('workflow started', inst?.status === 'RUNNING' && inst?.current_step === 1);

// 1단계: 신청 조직(성/시 연맹)의 장이 승인
const provHead = { personId: session.personId!, orgId: prov.id, roleCodes: ['ORG_HEAD' as const] };
const pending1 = await listPendingFor(provHead);
check('step 1 visible to provincial head', pending1.some((p) => p.instance_id === inst!.id));

// 권한 없는 사람은 결재할 수 없어야 한다
let denied = false;
try {
  await act(inst!.id, 'APPROVE', {
    personId: session.personId!, orgId: cuc.id, roleCodes: ['ORG_STAFF'],
  });
} catch {
  denied = true;
}
check('unauthorized approval blocked', denied);

const after1 = await act(inst!.id, 'APPROVE', provHead);
check('step 1 approved -> step 2', after1.current_step === 2 && after1.status === 'RUNNING');

// 2단계: 상급 조직(국가연맹)의 장이 최종 승인
const fedHead = { personId: session.personId!, orgId: fed.id, roleCodes: ['ORG_HEAD' as const] };
const pending2 = await listPendingFor(fedHead);
check('step 2 visible to national federation', pending2.some((p) => p.instance_id === inst!.id));
check('step 1 no longer in provincial queue',
  !(await listPendingFor(provHead)).some((p) => p.instance_id === inst!.id));

const after2 = await act(inst!.id, 'APPROVE', fedHead, 'ok');
check('final approval closes workflow', after2.status === 'APPROVED');

const finalSub = await queryOne<{ status: string; decided_at: string | null }>(
  `SELECT status, decided_at FROM core.form_submission WHERE id = $1`, [submission.id]);
check('submission marked APPROVED', finalSub?.status === 'APPROVED' && finalSub.decided_at !== null);

console.log('\n[6] audit trail');
const audit = await query<{ action: string }>(
  `SELECT action FROM core.audit_log ORDER BY occurred_at`);
const actions = audit.map((a) => a.action);
check('login recorded', actions.includes('LOGIN'));
check('submit recorded', actions.includes('SUBMIT'));
check('approvals recorded', actions.filter((a) => a === 'APPROVE').length === 2);
// 조직 생성만 콕 집어 센다(다른 엔티티의 INSERT 감사와 섞이지 않게)
check('org creation recorded',
  (await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.audit_log WHERE action='INSERT' AND entity_table='organization'`))!.n === 3);

// 감사 로그 뷰어 backend — 필터 조회 + 선택지
const orgInserts = await listAuditLog({ entityTable: 'organization', action: 'INSERT' });
check('감사 조회: 조직 INSERT 3건', orgInserts.length === 3, String(orgInserts.length));
check('감사 행에 시각·담당자·before/after', orgInserts.every((r) => Boolean(r.occurred_at) && 'before_data' in r && 'after_data' in r));
const facets = await auditFacets();
check('감사 필터 선택지(엔티티·액션)', facets.tables.includes('organization') && facets.actions.includes('INSERT'));

console.log('\n[7] administrative reorganization (2025 province merger)');
await mergeOrganization(prov.id, fed.id, '2025-07-01', { personId: session.personId });
const merged = await queryOne<{ status: string; merged_into_id: string | null; effective_to: string | null }>(
  `SELECT status, merged_into_id, effective_to FROM core.organization WHERE id = $1`, [prov.id]);
check('merged org closed, not deleted', merged?.status === 'CLOSED' && merged.merged_into_id === fed.id);
check('past submission still references it',
  (await queryOne<{ n: string }>(
    `SELECT count(*)::int AS n FROM core.form_submission WHERE submitter_org_id = $1`, [prov.id]))!.n as unknown as number === 1);
check('merge recorded in audit', (await query(`SELECT 1 FROM core.audit_log WHERE action='MERGE'`)).length === 1);

await closePool();
console.log(failed === 0 ? '\nSmoke test passed — the whole flow works end to end.\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
