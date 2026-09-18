'use client';

import { useState } from 'react';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { requestOtp, verifyOtp } from './actions';

/**
 * 전화번호 + OTP 로그인.
 * 발송 어댑터(Zalo ZNS / SMS)가 붙기 전까지는 개발용 코드를 화면에 표시한다.
 */
export function LoginForm({
  locale,
  labels,
  errors,
}: {
  locale: Locale;
  labels: {
    phone: string;
    otp: string;
    sendOtp: string;
    verifyOtp: string;
    otpSentTemplate: string;
  };
  /** AuthError 코드 → 사용자용 메시지. 없는 코드는 default 로 떨어진다. */
  errors: Record<string, string>;
}) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-base';
  const button =
    'w-full rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50';

  // AuthError 코드를 사용자 언어 메시지로. 모르는 코드는 default 로.
  const msg = (code?: string) => (code && errors[code]) || errors.default;

  async function send() {
    setBusy(true);
    setError(null);
    const res = await requestOtp(phone, locale);
    setBusy(false);
    if (!res.ok) return setError(msg(res.error));
    setSent(true);
    setDevCode(res.devCode ?? null);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await verifyOtp(phone, code, locale);
    setBusy(false);
    if (res && !res.ok) setError(msg(res.error));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{labels.phone}</label>
        <input
          className={input}
          type="tel"
          inputMode="numeric"
          placeholder="0912345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={sent}
        />
      </div>

      {sent ? (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{labels.otp}</label>
            <input
              className={input + ' tracking-[0.4em] text-center font-mono'}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {devCode ? (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              dev code: <span className="font-mono font-bold">{devCode}</span>
            </p>
          ) : null}
          <button className={button} onClick={verify} disabled={busy || code.length < 6}>
            {labels.verifyOtp}
          </button>
        </>
      ) : (
        <button className={button} onClick={send} disabled={busy || phone.length < 9}>
          {labels.sendOtp}
        </button>
      )}

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
