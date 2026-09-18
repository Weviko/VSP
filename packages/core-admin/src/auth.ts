/**
 * 인증 — 전화번호 + OTP.
 *
 * 설계 근거
 *  - 베트남은 전화번호가 사실상 신분증이다. 이메일 도달률은 매우 낮다.
 *  - 발송은 Zalo ZNS 우선, SMS 폴백. ZNS가 SMS보다 훨씬 저렴하고 열람률이 높다.
 *  - OTP 코드와 세션 토큰은 DB에 해시로만 저장한다. DB가 유출돼도 계정을 탈취당하지 않는다.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import { hasAdapter, sendNow, renderTemplate } from './notify';
import type { UUID, RoleCode } from './types';
import type { Locale } from './i18n';

const OTP_TTL_MINUTES = 5;
const SESSION_TTL_DAYS = 30;
const THROTTLE_WINDOW_MINUTES = 15;
const THROTTLE_MAX_REQUESTS = 5;
// IP 한도는 넉넉히(공용 사무실 IP 배려) 두되, 한 곳에서 여러 번호로 OTP 를 스프레이해
// SMS 비용을 태우거나 번호를 훑는 것은 막는다.
const THROTTLE_IP_MAX_REQUESTS = 20;

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

/**
 * 베트남 전화번호 정규화.
 * +84912345678 / 84912345678 / 0912345678 을 모두 0912345678 로 통일한다.
 * 통일하지 않으면 같은 사람이 여러 계정을 만들게 된다.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let n = digits.startsWith('+84')
    ? '0' + digits.slice(3)
    : digits.startsWith('84') && digits.length >= 11
      ? '0' + digits.slice(2)
      : digits;
  if (!n.startsWith('0')) n = '0' + n;
  return /^0\d{9}$/.test(n) ? n : null;
}

export class AuthError extends Error {
  constructor(
    public code:
      | 'INVALID_PHONE' | 'THROTTLED' | 'NO_CHALLENGE'
      | 'EXPIRED' | 'WRONG_CODE' | 'TOO_MANY_ATTEMPTS'
      // 발송 단계 — 운영에서 OTP 가 실제로 도달하지 못하면 로그인 자체가 불가능하다
      | 'OTP_SEND_FAILED' | 'OTP_NOT_CONFIGURED',
    message?: string
  ) {
    super(message ?? code);
  }
}

/**
 * 요청 빈도 제한. 같은 번호로 OTP를 반복 요청해 SMS 비용을 태우는 것을 막는다.
 * maxRequests 로 한도를 다르게 줄 수 있다(전화번호는 촘촘히, IP는 여러 번호를 허용하되 스프레이는 차단).
 */
async function checkThrottle(key: string, maxRequests: number = THROTTLE_MAX_REQUESTS): Promise<void> {
  const row = await queryOne<{ count: number; window_start: string; blocked_until: string | null }>(
    `SELECT count, window_start, blocked_until FROM core.auth_throttle WHERE key = $1`,
    [key]
  );
  const now = Date.now();

  if (row?.blocked_until && new Date(row.blocked_until).getTime() > now)
    throw new AuthError('THROTTLED');

  const windowExpired =
    !row || now - new Date(row.window_start).getTime() > THROTTLE_WINDOW_MINUTES * 60_000;

  if (windowExpired) {
    await query(
      `INSERT INTO core.auth_throttle(key, count, window_start, blocked_until)
       VALUES ($1, 1, now(), NULL)
       ON CONFLICT (key) DO UPDATE SET count = 1, window_start = now(), blocked_until = NULL`,
      [key]
    );
    return;
  }

  if (row.count + 1 > maxRequests) {
    await query(
      `UPDATE core.auth_throttle
          SET blocked_until = now() + make_interval(mins => $2)
        WHERE key = $1`,
      [key, THROTTLE_WINDOW_MINUTES]
    );
    throw new AuthError('THROTTLED');
  }
  await query(`UPDATE core.auth_throttle SET count = count + 1 WHERE key = $1`, [key]);
}

export interface OtpIssued {
  challengeId: UUID;
  phone: string;
  expiresAt: string;
  /** 개발 환경에서만 채워진다. 운영에서는 절대 반환하지 않는다. */
  devCode?: string;
}

/**
 * OTP 발급 + 발송.
 *
 * 코드를 만들어 해시로 저장하고, 등록된 알림 어댑터(Zalo ZNS 우선, SMS 폴백)로 즉시 보낸다.
 * 발송은 큐를 거치지 않는다 — OTP 는 5분 안에 도달해야 하고, 도달 실패를 그 자리에서 알아야 한다.
 *
 * 운영/개발 경계:
 *  - 운영(NODE_ENV=production): 실제 어댑터로 도달해야만 성공한다.
 *    어댑터가 없으면 OTP_NOT_CONFIGURED, 발송이 실패하면 OTP_SEND_FAILED 로 크게 실패시킨다.
 *    (조용히 성공한 척하면 아무도 로그인하지 못하는 상태를 눈치채지 못한다.)
 *  - 개발: 콘솔 어댑터로 흘리고, 코드를 devCode 로 화면에 함께 돌려준다.
 */
export async function issueOtp(
  rawPhone: string,
  opts: { purpose?: string; ip?: string | null; channel?: 'ZALO' | 'SMS'; locale?: Locale } = {}
): Promise<OtpIssued> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError('INVALID_PHONE');

  // 두 겹의 한도: 번호별(촘촘히) + IP별(여러 번호 스프레이 차단). IP 가 없으면(개발 등) 번호만.
  await checkThrottle(`phone:${phone}`);
  if (opts.ip) await checkThrottle(`otp-ip:${opts.ip}`, THROTTLE_IP_MAX_REQUESTS);

  const channel = opts.channel ?? 'ZALO';
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const row = await queryOne<{ id: UUID; expires_at: string }>(
    `INSERT INTO core.otp_challenge (phone, code_hash, purpose, channel, expires_at, created_ip)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $6), $5)
     RETURNING id, expires_at`,
    [phone, sha256(code), opts.purpose ?? 'LOGIN', channel, opts.ip ?? null, OTP_TTL_MINUTES]
  );

  const issued: OtpIssued = { challengeId: row!.id, phone, expiresAt: row!.expires_at };
  const isProd = process.env.NODE_ENV === 'production';

  // 발송 — 로그인 시점엔 사용자 언어를 모르므로 화면 언어(없으면 베트남어)로 보낸다
  const body = renderTemplate('OTP_LOGIN', opts.locale ?? 'vi', { code, min: OTP_TTL_MINUTES });
  let delivered = false;
  if (hasAdapter(channel)) {
    try {
      delivered = await sendNow(channel, phone, body, {
        templateCode: 'OTP_LOGIN',
        vars: { code, min: OTP_TTL_MINUTES },
      });
    } catch (e) {
      // 운영에서는 발송 실패를 로그인 성공으로 위장하지 않는다
      if (isProd) throw new AuthError('OTP_SEND_FAILED', e instanceof Error ? e.message : undefined);
      // 개발에서는 발송이 실패해도 devCode 로 계속 진행한다
    }
  }

  if (isProd) {
    // 실제 도달(개발용 콘솔 어댑터 제외)이 확인돼야만 발급을 인정한다
    if (!delivered) throw new AuthError('OTP_NOT_CONFIGURED');
  } else {
    // 개발 편의: 화면에서 코드를 바로 확인할 수 있게 한다
    issued.devCode = code;
  }
  return issued;
}

export interface SessionInfo {
  token: string;
  sessionId: UUID;
  accountId: UUID;
  personId: UUID | null;
  expiresAt: string;
}

/**
 * OTP 검증 후 로그인.
 * 해당 전화번호의 계정이 없으면 만들어 준다 (첫 로그인이 곧 가입).
 */
export async function verifyOtpAndLogin(
  rawPhone: string,
  code: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {}
): Promise<SessionInfo> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError('INVALID_PHONE');

  return tx(async (client) => {
    const chRes = await client.query(
      `SELECT * FROM core.otp_challenge
        WHERE phone = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone]
    );
    const ch = chRes.rows[0] as
      | { id: UUID; code_hash: string; attempts: number; max_attempts: number; expires_at: string }
      | undefined;

    if (!ch) throw new AuthError('NO_CHALLENGE');
    if (new Date(ch.expires_at).getTime() < Date.now()) throw new AuthError('EXPIRED');
    if (ch.attempts >= ch.max_attempts) throw new AuthError('TOO_MANY_ATTEMPTS');

    // 타이밍 공격을 피하기 위해 상수 시간 비교
    const given = Buffer.from(sha256(code));
    const expected = Buffer.from(ch.code_hash);
    const ok = given.length === expected.length && timingSafeEqual(given, expected);

    if (!ok) {
      await client.query(`UPDATE core.otp_challenge SET attempts = attempts + 1 WHERE id = $1`, [ch.id]);
      throw new AuthError('WRONG_CODE');
    }

    await client.query(`UPDATE core.otp_challenge SET consumed_at = now() WHERE id = $1`, [ch.id]);

    // 계정 확보 (없으면 생성)
    let acc = (
      await client.query(`SELECT id, person_id FROM core.account WHERE login_id = $1`, [phone])
    ).rows[0] as { id: UUID; person_id: UUID | null } | undefined;

    if (!acc) {
      const personRes = await client.query(
        `INSERT INTO core.person (full_name, phone) VALUES ($1, $2) RETURNING id`,
        [phone, phone]
      );
      const personId = personRes.rows[0].id as UUID;
      const accRes = await client.query(
        `INSERT INTO core.account (person_id, login_id, auth_provider)
         VALUES ($1, $2, 'LOCAL') RETURNING id, person_id`,
        [personId, phone]
      );
      acc = accRes.rows[0] as { id: UUID; person_id: UUID | null };
    }

    // 세션 발급: 원본 토큰은 쿠키에, DB에는 해시만
    const token = randomBytes(32).toString('base64url');
    const sessRes = await client.query(
      `INSERT INTO core.session (token_hash, account_id, person_id, user_agent, ip, expires_at)
       VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6))
       RETURNING id, expires_at`,
      [sha256(token), acc.id, acc.person_id, ctx.userAgent ?? null, ctx.ip ?? null, SESSION_TTL_DAYS]
    );

    await client.query(`UPDATE core.account SET last_login_at = now() WHERE id = $1`, [acc.id]);
    await writeAudit(
      {
        actorPersonId: acc.person_id,
        actorIp: ctx.ip,
        entitySchema: 'core',
        entityTable: 'account',
        entityId: acc.id,
        action: 'LOGIN',
      },
      client
    );

    return {
      token,
      sessionId: sessRes.rows[0].id as UUID,
      accountId: acc.id,
      personId: acc.person_id,
      expiresAt: sessRes.rows[0].expires_at as string,
    };
  });
}

export interface CurrentUser {
  sessionId: UUID;
  accountId: UUID;
  personId: UUID | null;
  fullName: string | null;
  phone: string | null;
  activeOrgId: UUID | null;
  /** 현재 활동 조직에서의 역할. 조직이 지정되지 않았으면 소속 전체의 역할을 모은다. */
  roleCodes: RoleCode[];
  locale: string;
}

/**
 * 업무 화면에 들어올 수 있는 역할.
 *
 * 로그인은 전화번호 인증만 거치면 누구나 된다 — 선수·학부모·팬도 계정이 생긴다.
 * 그러니 "로그인했다"는 업무 권한의 근거가 될 수 없다. 단체에 업무 역할로 배치된 사람만 들어온다.
 * 지도자(COACH)·일반회원(MEMBER)·기자(PRESS)는 회원 서비스 쪽을 쓴다.
 */
export const WORKSPACE_ROLES: readonly RoleCode[] = [
  'SYS_ADMIN', 'GOV_ADMIN', 'ORG_HEAD', 'ORG_STAFF', 'ORG_FINANCE', 'ORG_MEDIA',
];

export function canUseWorkspace(user: Pick<CurrentUser, 'roleCodes'> | null | undefined): boolean {
  return Boolean(user && user.roleCodes.some((r) => WORKSPACE_ROLES.includes(r)));
}

/** 쿠키 토큰으로 현재 사용자를 복원한다 */
export async function getCurrentUser(token: string | undefined | null): Promise<CurrentUser | null> {
  if (!token) return null;

  const row = await queryOne<{
    session_id: UUID;
    account_id: UUID;
    person_id: UUID | null;
    full_name: string | null;
    phone: string | null;
    active_org_id: UUID | null;
    locale: string;
  }>(
    `SELECT s.id AS session_id, s.account_id, s.person_id, s.active_org_id,
            p.full_name, p.phone, a.locale
       FROM core.session s
       JOIN core.account a ON a.id = s.account_id
       LEFT JOIN core.person p ON p.id = s.person_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [sha256(token)]
  );
  if (!row) return null;

  const roles = await query<{ role_code: RoleCode }>(
    `SELECT DISTINCT role_code FROM core.org_member
      WHERE person_id = $1
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
        AND ($2::uuid IS NULL OR org_id = $2::uuid)`,
    [row.person_id, row.active_org_id]
  );

  return {
    sessionId: row.session_id,
    accountId: row.account_id,
    personId: row.person_id,
    fullName: row.full_name,
    phone: row.phone,
    activeOrgId: row.active_org_id,
    roleCodes: roles.map((r) => r.role_code),
    locale: row.locale,
  };
}

export async function touchSession(sessionId: UUID): Promise<void> {
  await query(`UPDATE core.session SET last_seen_at = now() WHERE id = $1`, [sessionId]);
}

export async function logout(token: string): Promise<void> {
  await query(`UPDATE core.session SET revoked_at = now() WHERE token_hash = $1`, [sha256(token)]);
}

/** 소속 조직 목록 (조직 전환 메뉴용) */
export async function listMemberships(personId: UUID) {
  return query<{
    org_id: UUID;
    role_code: RoleCode;
    name_i18n: Record<string, string>;
    title: string | null;
  }>(
    `SELECT m.org_id, m.role_code, o.name_i18n, m.title
       FROM core.org_member m
       JOIN core.organization o ON o.id = m.org_id
      WHERE m.person_id = $1 AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
      ORDER BY o.name_i18n->>'vi'`,
    [personId]
  );
}

/** 활동 조직 전환 (여러 협회에 소속된 사람) */
export async function switchActiveOrg(sessionId: UUID, orgId: UUID | null): Promise<void> {
  await query(`UPDATE core.session SET active_org_id = $2 WHERE id = $1`, [sessionId, orgId]);
}
