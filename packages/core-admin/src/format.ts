/**
 * 표시 형식 유틸 (순수 함수 — 서버·클라이언트 공용).
 */

/**
 * 점수·기록 표시.
 *
 * DB는 numeric(12,3)으로 저장하므로 배구 21점도 "21.000"으로 들어온다.
 * 종목에 따라 소수가 의미 있는 경우(수영 21.345초)와 아닌 경우(배구 21점)가 있으므로
 * 의미 없는 뒤쪽 0만 떼어낸다. 21.500 -> 21.5, 21.000 -> 21.
 */
export function formatScore(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (!s.includes('.')) return s;
  const trimmed = s.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

/**
 * 베트남 동(VND) 금액 표시.
 * 베트남은 소수 단위를 쓰지 않고 천 단위 구분에 점을 쓴다. 1.500.000 ₫
 */
export function formatVND(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' ₫';
}

/** 날짜 범위를 짧게 (2026-11-01 ~ 11-05) */
export function formatDateRange(from: string, to: string): string {
  if (!to || from === to) return from;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  if (sameMonth) return `${from} ~ ${to.slice(8)}`;
  if (sameYear) return `${from} ~ ${to.slice(5)}`;
  return `${from} ~ ${to}`;
}
