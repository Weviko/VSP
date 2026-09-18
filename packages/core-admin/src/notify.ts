/**
 * 알림 발송.
 *
 * 이게 없으면 정산 기한이 다가와도, 결재가 밀려 있어도 아무도 모른다.
 * 시스템을 매일 들여다보는 사람은 없기 때문이다.
 *
 * 베트남에서는 이메일 도달률이 매우 낮다. Zalo 가 사실상 표준 채널이고,
 * SMS 는 건당 비용이 들어 폴백으로만 쓴다.
 *
 * 발송 사업자 계약 전이므로 지금은 큐에 쌓고 콘솔로 흘린다.
 * 계약이 끝나면 어댑터만 갈아끼우면 된다 — 호출부는 바뀌지 않는다.
 */
import { query, queryOne } from './db';
import type { UUID } from './types';
import type { I18nText, Locale } from './i18n';
import { t as pick } from './i18n';

export type Channel = 'ZALO' | 'SMS' | 'EMAIL' | 'PUSH' | 'INAPP';
export type NotifyStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface NotifyAdapter {
  channel: Channel;
  /**
   * 개발용 어댑터(콘솔 등)는 실제 도달로 치지 않는다.
   * OTP 처럼 "정말 전달됐는지"가 로그인 성패를 가르는 발송에서 구분에 쓴다.
   */
  dev?: boolean;
  send(to: string, body: string, payload?: Record<string, unknown>): Promise<void>;
}

const adapters = new Map<Channel, NotifyAdapter>();

/** 발송 사업자 어댑터를 등록한다. 없는 채널은 큐에만 남는다. */
export function registerAdapter(a: NotifyAdapter): void {
  adapters.set(a.channel, a);
}

/** 해당 채널에 어댑터가 등록돼 있는지 (개발용 포함). */
export function hasAdapter(channel: Channel): boolean {
  return adapters.has(channel);
}

/**
 * 즉시 발송 — 큐를 거치지 않는다.
 * OTP 처럼 초 단위로 도달해야 하고, 도달 실패를 즉시 알아야 하는 것에만 쓴다.
 * 어댑터가 없으면 NO_ADAPTER 로 throw, 발송 실패는 그대로 throw 한다.
 * 반환값 true = 개발용이 아닌 실제 어댑터로 보냈다.
 */
export async function sendNow(
  channel: Channel,
  to: string,
  body: string,
  payload?: Record<string, unknown>
): Promise<boolean> {
  const adapter = adapters.get(channel);
  if (!adapter) throw new Error('NO_ADAPTER');
  await adapter.send(to, body, payload);
  return !adapter.dev;
}

/** 개발용 — 콘솔로 흘린다. 실제 발송 전에 문구를 확인할 수 있다. */
export const consoleAdapter: NotifyAdapter = {
  channel: 'ZALO',
  dev: true,
  async send(to, body) {
    console.log(`[notify:console] ${to} <- ${body}`);
  },
};

/** 템플릿. 문구가 코드에 흩어지면 번역과 수정이 불가능해진다. */
export const TEMPLATES: Record<string, Record<Locale, string>> = {
  // 담당자가 직접 작성해 보내는 자유 문구. 본문이 곧 메시지다.
  CUSTOM: { vi: '{message}', en: '{message}', ko: '{message}' },
  OTP_LOGIN: {
    vi: 'Mã đăng nhập VSP: {code}. Hiệu lực {min} phút. Không chia sẻ mã cho bất kỳ ai.',
    en: 'Your VSP login code is {code}. Valid for {min} minutes. Never share it.',
    ko: 'VSP 로그인 인증코드 {code} · {min}분간 유효 · 타인에게 알려주지 마세요.',
  },
  APPROVAL_PENDING: {
    vi: 'Có {n} hồ sơ chờ bạn phê duyệt.',
    en: 'You have {n} item(s) waiting for approval.',
    ko: '결재 대기 {n}건이 있습니다.',
  },
  APPROVAL_OVERDUE: {
    vi: 'Hồ sơ "{title}" đã quá hạn xử lý theo quy định.',
    en: 'The item "{title}" has passed its legal processing deadline.',
    ko: '"{title}" 건이 법정 처리기한을 넘겼습니다.',
  },
  REGISTRATION_APPROVED: {
    vi: 'Đăng ký của {name} đã được phê duyệt.',
    en: 'Registration for {name} has been approved.',
    ko: '{name}님의 등록이 승인되었습니다.',
  },
  SETTLEMENT_DUE: {
    vi: 'Hạn quyết toán khoản trợ cấp "{title}" là {date}.',
    en: 'Settlement for grant "{title}" is due on {date}.',
    ko: '"{title}" 보조금 정산 기한이 {date}입니다.',
  },
  SETTLEMENT_OVERDUE: {
    vi: 'Quyết toán "{title}" đã quá hạn {date}.',
    en: 'Settlement for "{title}" is overdue since {date}.',
    ko: '"{title}" 정산이 {date} 기한을 넘겼습니다.',
  },
  DOCUMENT_RECEIVED: {
    vi: 'Có văn bản đến mới: {title}',
    en: 'New incoming document: {title}',
    ko: '새 공문이 도착했습니다: {title}',
  },
  DOCUMENT_REPLY_DUE: {
    vi: 'Hạn trả lời văn bản "{title}" là {date}.',
    en: 'Reply to "{title}" is due on {date}.',
    ko: '"{title}" 공문 회신 기한이 {date}입니다.',
  },
  PAYMENT_UNPAID: {
    vi: 'Khoản phí {amount} chưa được nộp.',
    en: 'An unpaid fee of {amount} remains.',
    ko: '미납 금액 {amount}이 있습니다.',
  },
  EVENT_ENTRY_CLOSING: {
    vi: 'Hạn đăng ký giải "{title}" là {date}.',
    en: 'Entry for "{title}" closes on {date}.',
    ko: '"{title}" 참가 신청이 {date}에 마감됩니다.',
  },
};

export function renderTemplate(
  code: string,
  locale: Locale,
  vars: Record<string, string | number> = {}
): string {
  const tpl = TEMPLATES[code]?.[locale] ?? TEMPLATES[code]?.vi ?? code;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    tpl
  );
}

export interface QueueInput {
  personId?: UUID | null;
  channel?: Channel;
  templateCode: string;
  vars?: Record<string, string | number>;
  locale?: Locale;
}

/**
 * 알림 큐에 넣는다.
 * 발송 실패가 업무를 막으면 안 되므로 큐에 먼저 쌓고 별도로 흘려보낸다.
 */
export async function queueNotification(input: QueueInput): Promise<UUID | null> {
  // 수신자의 언어로 보낸다. 베트남 담당자에게 한국어 알림이 가면 안 읽는다.
  let locale: Locale = input.locale ?? 'vi';
  let phone: string | null = null;

  if (input.personId) {
    const p = await queryOne<{ phone: string | null; locale: string | null }>(
      `SELECT p.phone, a.locale
         FROM core.person p
         LEFT JOIN core.account a ON a.person_id = p.id
        WHERE p.id = $1 LIMIT 1`,
      [input.personId]
    );
    phone = p?.phone ?? null;
    if (!input.locale && (p?.locale === 'vi' || p?.locale === 'en' || p?.locale === 'ko')) {
      locale = p.locale;
    }
  }

  const body = renderTemplate(input.templateCode, locale, input.vars ?? {});

  const rows = await query<{ id: UUID }>(
    `INSERT INTO core.notification (person_id, channel, template_code, payload, status)
     VALUES ($1,$2,$3,$4::jsonb,'QUEUED')
     RETURNING id`,
    [
      input.personId ?? null,
      input.channel ?? 'ZALO',
      input.templateCode,
      JSON.stringify({ body, to: phone, templateCode: input.templateCode, vars: input.vars ?? {}, locale }),
    ]
  );
  return rows[0]?.id ?? null;
}

export interface FlushResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * 큐를 흘려보낸다.
 *
 * 어댑터가 없는 채널은 SKIPPED 로 남긴다. 실패가 아니라 "아직 연결 안 됨"이므로
 * 나중에 어댑터를 붙이고 다시 흘리면 그대로 나간다.
 */
export async function flushNotifications(limit = 100): Promise<FlushResult> {
  const pending = await query<{
    id: UUID;
    channel: Channel;
    payload: { body?: string; to?: string | null; templateCode?: string; vars?: Record<string, string | number> };
  }>(
    `SELECT id, channel, payload FROM core.notification
      WHERE status = 'QUEUED' ORDER BY created_at LIMIT $1`,
    [limit]
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of pending) {
    const adapter = adapters.get(n.channel);
    const to = n.payload?.to ?? null;
    const body = n.payload?.body ?? '';

    if (!adapter || !to) {
      await query(`UPDATE core.notification SET status='SKIPPED' WHERE id=$1`, [n.id]);
      skipped += 1;
      continue;
    }
    try {
      await adapter.send(to, body, { templateCode: n.payload?.templateCode, vars: n.payload?.vars });
      await query(`UPDATE core.notification SET status='SENT', sent_at=now() WHERE id=$1`, [n.id]);
      sent += 1;
    } catch {
      await query(`UPDATE core.notification SET status='FAILED' WHERE id=$1`, [n.id]);
      failed += 1;
    }
  }
  return { sent, failed, skipped };
}

/**
 * 기한 알림 생성.
 *
 * 매일 한 번 돌린다. 정산 기한, 공문 회신 기한, 결재 법정기한을 훑어
 * 담당자에게 미리 알린다. 대회 당일 출전 불가나 감사 지적처럼
 * 되돌릴 수 없는 사고는 대부분 "몰라서" 일어난다.
 */
export async function queueDeadlineReminders(daysAhead = 7): Promise<number> {
  let n = 0;

  // 정산 기한이 다가온 교부건 — 단체장에게
  const settlements = await query<{
    person_id: UUID; title: I18nText; due: string; locale: string | null;
  }>(
    `SELECT m.person_id, p.name_i18n AS title, w.settlement_due_on::text AS due, a.locale
       FROM grant_mgmt.award w
       JOIN grant_mgmt.program p ON p.id = w.program_id
       JOIN core.org_member m ON m.org_id = w.grantee_org_id AND m.role_code = 'ORG_HEAD'
                            AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
       LEFT JOIN core.account a ON a.person_id = m.person_id
      WHERE w.status <> 'CLOSED' AND w.settlement_due_on IS NOT NULL
        AND w.settlement_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`,
    [daysAhead]
  );
  for (const s of settlements) {
    await queueNotification({
      personId: s.person_id,
      templateCode: 'SETTLEMENT_DUE',
      vars: { title: pick(s.title, (s.locale as Locale) ?? 'vi'), date: s.due },
    });
    n += 1;
  }

  // 회신 기한이 다가온 공문 — 접수 담당자에게
  const replies = await query<{ person_id: UUID; title: string; due: string }>(
    `SELECT d.received_by AS person_id, doc.title, d.reply_due_on::text AS due
       FROM core.dispatch d
       JOIN core.document doc ON doc.id = d.document_id
      WHERE d.reply_doc_id IS NULL AND d.received_by IS NOT NULL
        AND d.reply_due_on IS NOT NULL
        AND d.reply_due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`,
    [daysAhead]
  );
  for (const r of replies) {
    await queueNotification({
      personId: r.person_id,
      templateCode: 'DOCUMENT_REPLY_DUE',
      vars: { title: r.title, due: r.due, date: r.due },
    });
    n += 1;
  }

  return n;
}

/** 발송 현황 (관리자 화면용) */
export async function getNotificationSummary() {
  return query<{ channel: Channel; status: NotifyStatus; n: number }>(
    `SELECT channel, status, count(*)::int AS n
       FROM core.notification GROUP BY channel, status ORDER BY channel, status`
  );
}

export interface NotificationRow {
  id: UUID;
  channel: Channel;
  status: NotifyStatus;
  template_code: string | null;
  to: string | null;
  created_at: string;
  sent_at: string | null;
}

/** 최근 알림 목록 (관리자 화면용). 본문은 빼고, 누구에게·무엇이·어떤 상태인지만. */
export async function listRecentNotifications(limit = 50): Promise<NotificationRow[]> {
  return query<NotificationRow>(
    `SELECT id, channel, status, template_code,
            payload->>'to' AS to, created_at::text, sent_at::text
       FROM core.notification
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)]
  );
}
