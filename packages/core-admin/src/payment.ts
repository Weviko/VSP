/**
 * 수납 (PAY).
 *
 * 자금 원칙 — 반드시 지킬 것:
 *   돈은 납부자 -> PG(VNPAY 등) -> **협회 계좌**로 직접 흐른다.
 *   우리 계좌를 거치지 않는다. 우리가 받아뒀다가 나눠주면 그것은
 *   Nghi dinh 52/2024 상 "수납 대행(thu ho)"이 되어 베트남 국가은행(SBV)
 *   결제중개업 라이선스 대상이 되고, 외국 자본에는 사실상 발급되지 않는다.
 *   따라서 payee_org_id(수취 조직)가 PG 가맹점이고, 우리는 시스템 이용료를 별도 청구한다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import { getPaymentGateway, type PaymentProvider } from './adapters/payment';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';
export type PaymentMethod = 'VNPAY_QR' | 'MOMO' | 'ZALOPAY' | 'BANK' | 'CASH';

export interface FeeRule {
  id: UUID;
  org_id: UUID;
  code: string;
  name_i18n: I18nText;
  amount: string;
  currency: string;
  conditions: Record<string, unknown> | null;
  season_id: UUID | null;
  valid_from: string | null;
  valid_to: string | null;
}

export interface PaymentOrder {
  id: UUID;
  order_no: string;
  payer_person_id: UUID | null;
  payer_org_id: UUID | null;
  payee_org_id: UUID;
  ref_type: string | null;
  ref_id: UUID | null;
  amount: string;
  currency: string;
  method: PaymentMethod | null;
  status: PaymentStatus;
  is_offline: boolean;
  recorded_by: UUID | null;
  pg_txn_ref: string | null;
  invoice_no: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PaymentOrderRow extends PaymentOrder {
  payer_name: string | null;
  payee_name: I18nText;
}

export class FeeCapExceededError extends Error {
  constructor(public amount: number, public cap: number) {
    super(`fee ${amount} exceeds central cap ${cap}`);
  }
}

export async function listFeeRules(orgId?: UUID | null): Promise<FeeRule[]> {
  return query<FeeRule>(
    `SELECT * FROM core.fee_rule
      WHERE ($1::uuid IS NULL OR org_id = $1)
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      ORDER BY code`,
    [orgId ?? null]
  );
}

export interface CreateFeeRuleInput {
  orgId: UUID;
  code: string;
  nameI18n: I18nText;
  amount: number;
  currency?: string;
  seasonId?: UUID | null;
  conditions?: Record<string, unknown> | null;
}

/**
 * 요금 규칙 등록.
 * 금액은 협회가 정하고 중앙이 상한을 가이드한다(확정 방침).
 * 상한이 설정돼 있으면 초과분은 거부한다.
 */
export async function createFeeRule(
  input: CreateFeeRuleInput,
  opts: { centralCapAmount?: number | null } = {}
): Promise<FeeRule> {
  if (opts.centralCapAmount != null && input.amount > opts.centralCapAmount) {
    throw new FeeCapExceededError(input.amount, opts.centralCapAmount);
  }
  const rows = await query<FeeRule>(
    `INSERT INTO core.fee_rule (org_id, code, name_i18n, amount, currency, season_id, conditions)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb)
     RETURNING *`,
    [
      input.orgId, input.code, JSON.stringify(input.nameI18n),
      input.amount, input.currency ?? 'VND', input.seasonId ?? null,
      input.conditions ? JSON.stringify(input.conditions) : null,
    ]
  );
  return rows[0];
}

/** 주문번호: 날짜 + 난수. 사람이 전화로 불러줄 수 있을 만큼 짧게. */
function makeOrderNo(): string {
  const d = new Date();
  const ymd =
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  return `VSP${ymd}-${rand}`;
}

/** 요금 규칙 삭제(잘못 만든 규칙 제거). 수납 건은 금액을 복사해 두므로 과거 수납엔 영향 없다. */
export async function deleteFeeRule(id: UUID, actorPersonId?: UUID | null): Promise<void> {
  await query(`DELETE FROM core.fee_rule WHERE id = $1`, [id]);
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'core', entityTable: 'fee_rule', entityId: id, action: 'DELETE' });
}

export interface CreateOrderInput {
  payeeOrgId: UUID;
  payerPersonId?: UUID | null;
  payerOrgId?: UUID | null;
  refType?: string | null;
  refId?: UUID | null;
  amount: number;
  currency?: string;
  method?: PaymentMethod | null;
}

export async function createPaymentOrder(input: CreateOrderInput): Promise<PaymentOrder> {
  const rows = await query<PaymentOrder>(
    `INSERT INTO core.payment_order
       (order_no, payer_person_id, payer_org_id, payee_org_id,
        ref_type, ref_id, amount, currency, method, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING')
     RETURNING *`,
    [
      makeOrderNo(), input.payerPersonId ?? null, input.payerOrgId ?? null,
      input.payeeOrgId, input.refType ?? null, input.refId ?? null,
      input.amount, input.currency ?? 'VND', input.method ?? null,
    ]
  );
  return rows[0];
}

/**
 * 현금 수납 기록.
 *
 * 지방 협회는 여전히 현장에서 현금을 받는다. 이를 시스템 밖에 두면
 * 수납 현황이 반쪽이 되므로 담당자가 대리 입력할 수 있게 한다.
 * 누가 입력했는지(recorded_by)를 남겨 사후 확인이 가능하게 한다.
 */
export async function recordOfflinePayment(
  orderId: UUID,
  actor: { personId: UUID; orgId?: UUID | null },
  note?: string
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE core.payment_order
          SET status='PAID', method='CASH', is_offline=true,
              recorded_by=$2, paid_at=now()
        WHERE id=$1 AND status <> 'PAID'`,
      [orderId, actor.personId]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'payment_order', entityId: orderId,
        action: 'RECORD_CASH', after: { method: 'CASH' }, note: note ?? null,
      },
      client
    );
  });
}

/** PG 결제 완료 처리 (콜백에서 호출) */
export async function markPaid(
  orderId: UUID,
  pgTxnRef: string,
  method: PaymentMethod
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE core.payment_order
          SET status='PAID', method=$3, pg_txn_ref=$2, paid_at=now()
        WHERE id=$1 AND status <> 'PAID'`,
      [orderId, pgTxnRef, method]
    );
    await writeAudit(
      {
        entitySchema: 'core', entityTable: 'payment_order', entityId: orderId,
        action: 'PAYMENT_CONFIRMED', after: { pg_txn_ref: pgTxnRef, method },
      },
      client
    );
  });
}

/** 주문번호로 조회 — 게이트웨이 리턴 확인에 쓴다. */
export async function getPaymentOrderByNo(orderNo: string): Promise<PaymentOrder | null> {
  return queryOne<PaymentOrder>(`SELECT * FROM core.payment_order WHERE order_no = $1`, [orderNo]);
}

const PROVIDER_METHOD: Record<PaymentProvider, PaymentMethod> = {
  VNPAY: 'VNPAY_QR', MOMO: 'MOMO', ZALOPAY: 'ZALOPAY', MOCK: 'VNPAY_QR',
};

export interface ConfirmResult {
  ok: boolean;
  orderId?: UUID;
  reason?: string;   // NO_GATEWAY / BAD_SIGNATURE / NO_ORDER / ORDER_NOT_FOUND / PAYMENT_FAILED / AMOUNT_MISMATCH
}

/**
 * 게이트웨이 리턴/IPN 확인 → 유효한 성공이면 주문을 PAID 로 확정.
 *
 * 서명 검증이 곧 인증이다(세션 없음). 위조·실패·금액불일치는 확정하지 않는다. 재호출에 멱등.
 * 실제 대금은 이미 게이트웨이에서 협회 계좌로 이동했고, 여기서는 그 사실을 기록만 한다.
 * 공개 콜백 라우트는 결제 라이선스 확정 후 실무 통합에서 이 함수를 호출하도록 붙인다.
 */
export async function confirmPaymentReturn(
  provider: PaymentProvider,
  params: Record<string, string>
): Promise<ConfirmResult> {
  const gw = getPaymentGateway(provider);
  if (!gw) return { ok: false, reason: 'NO_GATEWAY' };
  const r = gw.verifyReturn(params);
  if (!r.valid) return { ok: false, reason: 'BAD_SIGNATURE' };
  if (!r.orderNo) return { ok: false, reason: 'NO_ORDER' };
  const order = await getPaymentOrderByNo(r.orderNo);
  if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (!r.success) return { ok: false, orderId: order.id, reason: 'PAYMENT_FAILED' };
  if (r.amount != null && Math.round(Number(order.amount)) !== Math.round(r.amount)) {
    return { ok: false, orderId: order.id, reason: 'AMOUNT_MISMATCH' };
  }
  if (order.status === 'PAID') return { ok: true, orderId: order.id }; // 멱등
  await markPaid(order.id, r.txnRef ?? `${provider}-${Date.now()}`, PROVIDER_METHOD[provider]);
  return { ok: true, orderId: order.id };
}

export async function listPaymentOrders(filter: {
  payeeOrgId?: UUID | null;
  /** 한 사람이 낸(낼) 금액만 — 회원 서비스의 "내 납부" */
  payerPersonId?: UUID | null;
  status?: PaymentStatus | null;
  refType?: string | null;
  limit?: number;
}): Promise<PaymentOrderRow[]> {
  return query<PaymentOrderRow>(
    `SELECT po.*, p.full_name AS payer_name, o.name_i18n AS payee_name
       FROM core.payment_order po
       LEFT JOIN core.person p ON p.id = po.payer_person_id
       JOIN core.organization o ON o.id = po.payee_org_id
      WHERE ($1::uuid IS NULL OR po.payee_org_id = $1)
        AND ($2::text IS NULL OR po.status = $2)
        AND ($3::text IS NULL OR po.ref_type = $3)
        AND ($5::uuid IS NULL OR po.payer_person_id = $5)
      ORDER BY po.created_at DESC
      LIMIT $4`,
    [
      filter.payeeOrgId ?? null, filter.status ?? null, filter.refType ?? null,
      filter.limit ?? 100, filter.payerPersonId ?? null,
    ]
  );
}

export interface PaymentSummary {
  paid_count: number;
  paid_amount: string;
  pending_count: number;
  pending_amount: string;
}

/** 수납 요약 (대시보드·정산) */
export async function getPaymentSummary(orgId?: UUID | null): Promise<PaymentSummary> {
  const row = await queryOne<PaymentSummary>(
    `SELECT
       count(*) FILTER (WHERE status='PAID')::int AS paid_count,
       COALESCE(sum(amount) FILTER (WHERE status='PAID'), 0)::text AS paid_amount,
       count(*) FILTER (WHERE status='PENDING')::int AS pending_count,
       COALESCE(sum(amount) FILTER (WHERE status='PENDING'), 0)::text AS pending_amount
     FROM core.payment_order
     WHERE ($1::uuid IS NULL OR payee_org_id = $1)`,
    [orgId ?? null]
  );
  return row ?? { paid_count: 0, paid_amount: '0', pending_count: 0, pending_amount: '0' };
}

/**
 * 미납 여부 확인.
 * 확정 방침: 미납 시 등록·출전을 자동 차단하되 협회가 예외를 줄 수 있다.
 * 차단 전에 Zalo 알림을 여러 번 보내는 것이 전제다.
 * 대회 당일 출전 불가 사태가 나면 시스템 탓이 되기 때문이다.
 */
export async function hasUnpaidFees(personId: UUID, refType?: string): Promise<boolean> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.payment_order
      WHERE payer_person_id = $1 AND status = 'PENDING'
        AND ($2::text IS NULL OR ref_type = $2)`,
    [personId, refType ?? null]
  );
  return (row?.n ?? 0) > 0;
}
