-- =====================================================================
-- VSP 003: 인증 (전화번호 + OTP)
-- 베트남에서는 전화번호가 사실상 신분증이고 이메일은 거의 쓰지 않는다.
-- 발송 채널은 Zalo ZNS 우선, SMS 폴백 (ZNS가 SMS보다 훨씬 저렴).
-- =====================================================================

CREATE TABLE core.otp_challenge (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  -- 코드는 평문으로 두지 않는다 (DB 유출 시 계정 탈취 방지)
  code_hash     text NOT NULL,
  purpose       text NOT NULL DEFAULT 'LOGIN',   -- LOGIN / VERIFY_PHONE / RESET
  channel       text,                            -- ZALO / SMS
  attempts      int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 5,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_ip    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.otp_challenge(phone, purpose, created_at DESC);
CREATE INDEX ON core.otp_challenge(expires_at);

CREATE TABLE core.session (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 쿠키에는 이 토큰의 해시가 아니라 원본을 담고, DB에는 해시만 저장한다
  token_hash    text UNIQUE NOT NULL,
  account_id    uuid NOT NULL REFERENCES core.account(id) ON DELETE CASCADE,
  person_id     uuid REFERENCES core.person(id),
  -- 현재 활동 중인 조직 (여러 조직에 소속된 경우 전환 가능)
  active_org_id uuid REFERENCES core.organization(id),
  user_agent    text,
  ip            inet,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.session(account_id);
CREATE INDEX ON core.session(expires_at);

-- 로그인 시도 제한 (무차별 대입 방어)
CREATE TABLE core.auth_throttle (
  key           text PRIMARY KEY,               -- phone 또는 ip
  count         int NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);
