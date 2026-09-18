/**
 * 결제 게이트웨이 어댑터 — 순수 로직 검증 (DB·네트워크 없음).
 *
 * 골격: 결제 URL 생성 + 리턴 서명 검증(HMAC-SHA512). 실제 대금 이동 없음.
 * 확인: 서명 왕복 유효, 변조 탐지, 금액 환산(×100), 응답코드 성공 판정, 모의 게이트웨이.
 */
import {
  createVnpayAdapter, vnpaySign, vnpayConfigFromEnv, mockPaymentGateway,
  registerPaymentGateway, getPaymentGateway, hasPaymentGateway,
} from '../packages/core-admin/src/adapters/payment.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

console.log('\n[1] 설정 (환경변수)');
check('키 없으면 null (개발 모의로 폴백)', vnpayConfigFromEnv({} as NodeJS.ProcessEnv) === null);
const cfg = vnpayConfigFromEnv({ VNPAY_TMN_CODE: 'TMN', VNPAY_HASH_SECRET: 'SECRET' } as unknown as NodeJS.ProcessEnv);
check('키 있으면 설정 생성', cfg?.tmnCode === 'TMN');
check('결제 URL 기본값(vnpayment)', (cfg?.payUrl ?? '').includes('vnpayment'));

const ad = createVnpayAdapter({ tmnCode: 'TMN', hashSecret: 'SECRET', payUrl: 'https://pay.example/vpc', returnUrl: 'https://ret.example' });

console.log('\n[2] 결제 URL 생성 + 서명');
const url = ad.buildPaymentUrl({ orderNo: 'ORD-1', amount: 50000, orderInfo: 'Le phi', ipAddr: '127.0.0.1', createdAt: new Date('2026-01-02T03:04:05Z') });
check('올바른 결제 엔드포인트', url.startsWith('https://pay.example/vpc?'));
const built = Object.fromEntries(new URL(url).searchParams);
check('금액 ×100 (VND)', built.vnp_Amount === '5000000', built.vnp_Amount);
check('주문번호 전달', built.vnp_TxnRef === 'ORD-1');
check('서명 포함', typeof built.vnp_SecureHash === 'string' && built.vnp_SecureHash.length === 128); // sha512 hex
check('생성일자 형식(yyyyMMddHHmmss)', built.vnp_CreateDate === '20260102030405', built.vnp_CreateDate);

console.log('\n[3] 리턴 서명 검증');
// 정상 성공 리턴을 구성(같은 키로 서명)
const ret: Record<string, string> = {
  vnp_TmnCode: 'TMN', vnp_Amount: '5000000', vnp_TxnRef: 'ORD-1',
  vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: 'VNP123',
};
ret.vnp_SecureHash = vnpaySign(ret, 'SECRET');
const ok = ad.verifyReturn(ret);
check('유효 서명 → valid', ok.valid);
check('응답코드 00 → success', ok.success);
check('주문번호 해석', ok.orderNo === 'ORD-1');
check('금액 환산(÷100)', ok.amount === 50000, String(ok.amount));
check('거래번호 해석', ok.txnRef === 'VNP123');

// 변조: 금액을 바꾸면 서명 불일치
const tampered = { ...ret, vnp_Amount: '1' };
check('변조 → invalid', ad.verifyReturn(tampered).valid === false);
// 실패 응답코드: 서명 유효해도 success=false
const failRet: Record<string, string> = { ...ret, vnp_ResponseCode: '24' };
delete (failRet as Record<string, string>).vnp_SecureHash;
failRet.vnp_SecureHash = vnpaySign(failRet, 'SECRET');
const f = ad.verifyReturn(failRet);
check('실패코드 → valid but !success', f.valid && !f.success);
// 다른 키로 서명하면 검증 실패
check('다른 키 서명 → invalid', ad.verifyReturn({ ...ret, vnp_SecureHash: vnpaySign(ret, 'WRONG') }).valid === false);

console.log('\n[4] 레지스트리 + 모의 게이트웨이');
check('등록 전 VNPAY 없음', hasPaymentGateway('VNPAY') === false);
registerPaymentGateway(ad);
check('등록 후 조회', getPaymentGateway('VNPAY')?.provider === 'VNPAY');
registerPaymentGateway(mockPaymentGateway);
const mok = mockPaymentGateway.verifyReturn({ order: 'ORD-9', amount: '30000', mock_ok: '1' });
check('모의: mock_ok=1 → success', mok.valid && mok.success && mok.orderNo === 'ORD-9');
check('모의: mock_ok 없음 → !success', mockPaymentGateway.verifyReturn({ order: 'X' }).success === false);

console.log(failed === 0 ? '\n결제 골격: URL 생성·서명 왕복·변조탐지·성공판정·모의 OK\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
