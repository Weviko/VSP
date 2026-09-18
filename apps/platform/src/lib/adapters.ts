/**
 * 서버 어댑터 등록 (부수효과 모듈).
 *
 * 추출기·알림·저장소는 어댑터로 갈아끼운다. 이 파일을 import 하는 것만으로 등록이 이뤄진다.
 *
 * 추출기 선택:
 *   - LLM 키가 설정돼 있으면(VSP_LLM_API_KEY / ANTHROPIC_API_KEY) LLM 추출기를 등록한다
 *     — 스캔 이미지·PDF·라벨 없는 산문까지 읽는다.
 *   - 키가 없으면 문서에 적힌 텍스트만 옮기는 안전 기본 추출기(heuristic)로 폴백한다.
 * 어느 쪽이든 AI 는 초안만 만들고, 사람이 확정해야 결재가 시작된다(자동 승인 없음).
 *
 * 알림 채널:
 *   - Zalo 토큰이 설정돼 있으면(ZALO_OA_TOKEN) Zalo ZNS 어댑터를 등록한다(베트남 표준).
 *   - 없으면 개발에서만 콘솔 어댑터로 폴백한다. 운영에서는 아무 어댑터도 등록하지 않는다
 *     — 그래야 OTP 발송이 콘솔 로그로 조용히 새지 않고, 로그인 시 OTP_NOT_CONFIGURED 로 크게 드러난다.
 */
import {
  registerExtractor, getExtractor, heuristicExtractor, createLlmExtractor, llmConfigFromEnv,
  registerAdapter, consoleAdapter, createZaloAdapter, zaloConfigFromEnv,
  registerPaymentGateway, vnpayConfigFromEnv, createVnpayAdapter, mockPaymentGateway,
} from '@vsp/core-admin';

// 이미 다른 추출기가 등록돼 있으면 덮어쓰지 않는다.
if (getExtractor().name === 'none') {
  const cfg = llmConfigFromEnv();
  registerExtractor(cfg ? createLlmExtractor(cfg) : heuristicExtractor);
}

// 알림 어댑터 — Zalo ZNS 설정이 있으면 그것을, 없으면 개발에서만 콘솔로.
const zalo = zaloConfigFromEnv();
if (zalo) {
  registerAdapter(createZaloAdapter(zalo));
} else if (process.env.NODE_ENV !== 'production') {
  registerAdapter(consoleAdapter);
}
// 운영에서 Zalo 설정이 없으면 여기서 아무것도 등록하지 않는다(의도된 것). 배포 체크리스트 참고.

// 결제 게이트웨이 — VNPay 설정이 있으면 그것을, 없으면 개발에서만 모의(mock)로.
// 운영에서 미설정이면 등록하지 않는다(모의로 실제 대금을 확정하지 않게).
const vnpay = vnpayConfigFromEnv();
if (vnpay) {
  registerPaymentGateway(createVnpayAdapter(vnpay));
} else if (process.env.NODE_ENV !== 'production') {
  registerPaymentGateway(mockPaymentGateway);
}
