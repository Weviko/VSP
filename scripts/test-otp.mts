/**
 * OTP 발송 판정 로직 — 순수 검증 (DB·네트워크 없음).
 *
 * 운영 병목 #1 이었다: 예전엔 코드를 만들어 저장만 하고 아무 데도 보내지 않았다.
 * 이제 issueOtp 가 등록된 어댑터로 실제로 보낸다. 그 판정의 핵심 규칙을 여기서 잠근다.
 *   - 어댑터가 있으면 즉시 발송(sendNow)한다.
 *   - "개발용" 어댑터(콘솔 등, dev:true)는 실제 도달로 치지 않는다 → 운영에서 로그인 못 하게.
 *   - 어댑터가 없으면 NO_ADAPTER 로 throw 한다.
 * issueOtp 의 DB 연동 발송은 smoke-test 가 실제 DB로 확인한다.
 */
import {
  registerAdapter, hasAdapter, sendNow, renderTemplate, type NotifyAdapter,
} from '../packages/core-admin/src/notify.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

console.log('\n[1] OTP 템플릿');
const vi = renderTemplate('OTP_LOGIN', 'vi', { code: '123456', min: 5 });
check('베트남어 본문에 코드', vi.includes('123456'));
check('유효시간(분) 치환', vi.includes('5'));
check('한국어 본문 존재', renderTemplate('OTP_LOGIN', 'ko', { code: '000111', min: 5 }).includes('000111'));

console.log('\n[2] 어댑터 유무 판정');
check('등록 전 SMS 어댑터 없음', hasAdapter('SMS') === false);

let smsTo = '', smsBody = '';
const smsAdapter: NotifyAdapter = {
  channel: 'SMS',
  async send(to, body) { smsTo = to; smsBody = body; },
};
registerAdapter(smsAdapter);
check('등록 후 SMS 어댑터 있음', hasAdapter('SMS') === true);

console.log('\n[3] 즉시 발송 (sendNow)');
const delivered = await sendNow('SMS', '0912345678', 'hello', { templateCode: 'OTP_LOGIN' });
check('실제 어댑터로 보내면 delivered=true', delivered === true);
check('수신자 전달', smsTo === '0912345678');
check('본문 전달', smsBody === 'hello');

console.log('\n[4] 개발용 어댑터는 도달로 치지 않는다');
const devAdapter: NotifyAdapter = {
  channel: 'PUSH',
  dev: true,
  async send() { /* 콘솔로 흘리는 셈 */ },
};
registerAdapter(devAdapter);
const devDelivered = await sendNow('PUSH', '0912345678', 'x');
check('dev 어댑터로 보내면 delivered=false', devDelivered === false);

console.log('\n[5] 어댑터 없는 채널은 예외');
let threw = false;
try { await sendNow('EMAIL', 'a@b.c', 'x'); } catch { threw = true; }
check('어댑터 없으면 throw (NO_ADAPTER)', threw);

console.log(failed === 0 ? '\nOTP 발송 판정: 템플릿·발송·개발용 구분·미설정 예외 OK\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
