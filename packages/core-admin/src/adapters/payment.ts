/**
 * 결제 게이트웨이 어댑터 (골격).
 *
 * 추출기·알림과 같은 교체 패턴 — 계약·라이선스가 확정되면 어댑터만 끼운다.
 * 자금 원칙(payment.ts 참조): 돈은 납부자 → PG → **협회 계좌**로 직접 흐르고 우리 계좌를 거치지 않는다.
 * 따라서 게이트웨이 자격(가맹점 코드·서명키)은 실제로는 수취 조직(payee)별로 다르다 —
 * 이 골격은 단일 환경설정(.env)로 시작하고, 실무 통합에서 조직별 자격으로 확장한다.
 *
 * 여기서는 순수 로직만 둔다: 결제 URL 생성 + 리턴 서명 검증. 실제 대금 이동은 게이트웨이가 한다.
 * 공개 콜백 라우트 연결은 결제 라이선스 확정 후 실무 통합에서 붙인다(민감 경로라 골격에 포함하지 않는다).
 */
import { createHmac } from 'node:crypto';

export type PaymentProvider = 'VNPAY' | 'MOMO' | 'ZALOPAY' | 'MOCK';

export interface PaymentRequest {
  orderNo: string;
  amount: number;        // VND (정수)
  orderInfo: string;
  ipAddr?: string;
  returnUrl?: string;    // 기본값(cfg.returnUrl) 대신 사용
  locale?: 'vn' | 'en';
  createdAt?: Date;
}

export interface PaymentReturn {
  valid: boolean;                 // 서명이 유효한가(= 인증)
  success: boolean;               // 결제 성공인가(응답코드 정상 + 서명 유효)
  orderNo: string | null;
  amount: number | null;          // VND
  txnRef: string | null;          // 게이트웨이 거래번호
  responseCode: string | null;
  raw: Record<string, string>;
}

export interface PaymentGatewayAdapter {
  provider: PaymentProvider;
  /** 사용자를 보낼 결제 URL 을 만든다. */
  buildPaymentUrl(input: PaymentRequest): string;
  /** 게이트웨이 리턴/IPN 파라미터의 서명을 검증하고 결과를 해석한다. */
  verifyReturn(params: Record<string, string>): PaymentReturn;
}

const gateways = new Map<PaymentProvider, PaymentGatewayAdapter>();

export function registerPaymentGateway(a: PaymentGatewayAdapter): void {
  gateways.set(a.provider, a);
}
export function getPaymentGateway(provider: PaymentProvider): PaymentGatewayAdapter | null {
  return gateways.get(provider) ?? null;
}
export function hasPaymentGateway(provider: PaymentProvider): boolean {
  return gateways.has(provider);
}

// ── VNPay ────────────────────────────────────────────────────────────────────

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
  returnUrl: string;
  version?: string;
  currCode?: string;
}

/** 환경변수에서 VNPay 설정을 만든다. 코드·키가 없으면 null(개발에선 모의 게이트웨이로 폴백). */
export function vnpayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VnpayConfig | null {
  if (!env.VNPAY_TMN_CODE || !env.VNPAY_HASH_SECRET) return null;
  return {
    tmnCode: env.VNPAY_TMN_CODE,
    hashSecret: env.VNPAY_HASH_SECRET,
    payUrl: env.VNPAY_PAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: env.VNPAY_RETURN_URL ?? '',
    version: env.VNPAY_VERSION ?? '2.1.0',
    currCode: 'VND',
  };
}

/** VNPay 규칙: 키 오름차순 정렬 + 값 인코딩(공백은 +). 서명 데이터이자 URL 쿼리. */
function encodeParams(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

/**
 * VNPay 서명(HMAC-SHA512, hex). params 에는 vnp_SecureHash 를 넣지 않는다.
 * 생성·검증이 같은 규칙을 쓰도록 공용 함수로 둔다. 키는 인자로만 받는다(코드/로그에 남기지 않는다).
 */
export function vnpaySign(params: Record<string, string>, hashSecret: string): string {
  const signData = encodeParams(params);
  return createHmac('sha512', hashSecret).update(Buffer.from(signData, 'utf-8')).digest('hex');
}

/** yyyyMMddHHmmss (VNPay). UTC 기준으로 고정 — 서명 왕복엔 절대시각 일관성만 필요하다. */
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function createVnpayAdapter(cfg: VnpayConfig): PaymentGatewayAdapter {
  return {
    provider: 'VNPAY',
    buildPaymentUrl(input) {
      const params: Record<string, string> = {
        vnp_Version: cfg.version ?? '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: cfg.tmnCode,
        vnp_Amount: String(Math.round(input.amount) * 100), // VNPay 는 ×100 (VND 소수 없음)
        vnp_CurrCode: cfg.currCode ?? 'VND',
        vnp_TxnRef: input.orderNo,
        vnp_OrderInfo: input.orderInfo,
        vnp_OrderType: 'other',
        vnp_Locale: input.locale ?? 'vn',
        vnp_ReturnUrl: input.returnUrl ?? cfg.returnUrl,
        vnp_IpAddr: input.ipAddr ?? '127.0.0.1',
        vnp_CreateDate: fmtDate(input.createdAt ?? new Date()),
      };
      const hash = vnpaySign(params, cfg.hashSecret);
      return `${cfg.payUrl}?${encodeParams(params)}&vnp_SecureHash=${hash}`;
    },
    verifyReturn(params) {
      const given = params.vnp_SecureHash ?? '';
      const rest: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType') rest[k] = v;
      }
      const expected = vnpaySign(rest, cfg.hashSecret);
      const valid = given.length > 0 && given.toLowerCase() === expected.toLowerCase();
      const rc = params.vnp_ResponseCode ?? null;
      const ts = params.vnp_TransactionStatus ?? null;
      return {
        valid,
        success: valid && rc === '00' && (ts === '00' || ts == null),
        orderNo: params.vnp_TxnRef ?? null,
        amount: params.vnp_Amount ? Number(params.vnp_Amount) / 100 : null,
        txnRef: params.vnp_TransactionNo ?? params.vnp_TxnRef ?? null,
        responseCode: rc,
        raw: params,
      };
    },
  };
}

/**
 * 개발/테스트용 모의 게이트웨이 — 실제 대금 이동 없음.
 * 리턴에 mock_ok=1 이면 성공으로 본다. 서명이 없으므로 운영에서는 절대 등록하지 않는다.
 */
export const mockPaymentGateway: PaymentGatewayAdapter = {
  provider: 'MOCK',
  buildPaymentUrl(input) {
    const q = new URLSearchParams({ order: input.orderNo, amount: String(Math.round(input.amount)) });
    return `/dev/mock-pay?${q.toString()}`;
  },
  verifyReturn(params) {
    const ok = params.mock_ok === '1';
    return {
      valid: true,
      success: ok,
      orderNo: params.order ?? params.vnp_TxnRef ?? null,
      amount: params.amount ? Number(params.amount) : null,
      txnRef: params.txn ?? `MOCK-${Date.now()}`,
      responseCode: ok ? '00' : '01',
      raw: params,
    };
  },
};
