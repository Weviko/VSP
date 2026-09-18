/**
 * Zalo ZNS 알림 어댑터 — 순수 로직 검증 (DB·네트워크 없음).
 *
 * ZNS 는 승인된 템플릿(template_id)만 보낸다. 알림 코드→template_id 매핑, 전화번호 정규화,
 * 요청 형태, 성공/오류 판정을 모의 fetch 로 확인한다.
 */
import {
  zaloConfigFromEnv, buildZnsRequest, createZaloAdapter,
} from '../packages/core-admin/src/adapters/zalo.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

console.log('\n[1] 설정 (환경변수)');
check('토큰 없으면 null (콘솔 폴백)', zaloConfigFromEnv({} as NodeJS.ProcessEnv) === null);
const cfg = zaloConfigFromEnv({
  ZALO_OA_TOKEN: 'tok', ZALO_ZNS_TEMPLATES: '{"APPROVAL_PENDING":"tpl_1"}',
} as unknown as NodeJS.ProcessEnv);
check('토큰 있으면 설정 생성', cfg?.accessToken === 'tok');
check('템플릿 맵 파싱', cfg?.templateMap.APPROVAL_PENDING === 'tpl_1');
check('엔드포인트 기본값', (cfg?.endpoint ?? '').includes('openapi.zalo.me'));

console.log('\n[2] 요청 빌더 (순수)');
const map = { templateMap: { APPROVAL_PENDING: 'tpl_1' }, defaultTemplateId: 'tpl_default' };
const r1 = buildZnsRequest(map, '0912345678', '결재 대기 3건', { templateCode: 'APPROVAL_PENDING', vars: { n: 3 } });
check('코드→template_id 매핑', r1?.template_id === 'tpl_1');
check('전화번호 84 정규화', r1?.phone === '84912345678', r1?.phone);
check('본문·변수가 template_data 로', r1?.template_data.content === '결재 대기 3건' && r1?.template_data.n === '3');
const r2 = buildZnsRequest(map, '0900', '기타', { templateCode: 'UNKNOWN_CODE' });
check('매핑 없으면 기본 템플릿', r2?.template_id === 'tpl_default');
const r3 = buildZnsRequest({ templateMap: {} }, '0900', 'x', { templateCode: 'X' });
check('기본 템플릿도 없으면 null', r3 === null);

console.log('\n[3] 전체 발송 (모의 fetch — 네트워크 없음)');
let sentUrl = '', sentToken = '', sentBody = '';
const okFetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
  sentUrl = url; sentToken = init.headers.access_token; sentBody = init.body;
  return new Response(JSON.stringify({ error: 0, message: 'Success' }), { status: 200 });
}) as unknown as typeof fetch;
const ad = createZaloAdapter({ accessToken: 'secret', endpoint: 'https://zns.example/message', templateMap: { APPROVAL_PENDING: 'tpl_1' }, fetchImpl: okFetch });
check('채널이 ZALO', ad.channel === 'ZALO');
await ad.send('0912345678', '결재 대기 3건', { templateCode: 'APPROVAL_PENDING', vars: { n: 3 } });
check('올바른 엔드포인트 호출', sentUrl === 'https://zns.example/message');
check('access_token 헤더 전달', sentToken === 'secret');
check('요청에 template_id·phone 포함', sentBody.includes('tpl_1') && sentBody.includes('84912345678'));

// ZNS 는 200 이라도 error!=0 이면 실패
const errFetch = (async () => new Response(JSON.stringify({ error: 105, message: 'Invalid template' }), { status: 200 })) as unknown as typeof fetch;
const adErr = createZaloAdapter({ accessToken: 's', endpoint: 'https://x', templateMap: { APPROVAL_PENDING: 'tpl_1' }, fetchImpl: errFetch });
let threw = false;
try { await adErr.send('0912', 'x', { templateCode: 'APPROVAL_PENDING' }); } catch { threw = true; }
check('ZNS 오류(error!=0)는 예외 → FAILED', threw);

// 매핑 없는 코드는 보낼 수 없으니 예외 (운영자가 매핑을 채우게)
const adNoTpl = createZaloAdapter({ accessToken: 's', endpoint: 'https://x', templateMap: {}, fetchImpl: okFetch });
let threw2 = false;
try { await adNoTpl.send('0912', 'x', { templateCode: 'NOPE' }); } catch { threw2 = true; }
check('매핑 없는 코드는 예외(NO_ZALO_TEMPLATE)', threw2);

console.log(failed === 0 ? '\nZalo ZNS: 템플릿 매핑·정규화·발송·오류판정 OK\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
