import { NextResponse } from 'next/server';
import { query } from '@vsp/core-admin';

/**
 * 헬스체크 — 로드밸런서/모니터가 인증 없이 친다.
 * 업무 데이터는 노출하지 않고 DB 연결만 확인한다(SELECT 1). 살아있으면 200, 아니면 503.
 * (경계 검사에서 이 경로는 인증 면제이되 업무 스키마 조회가 없어야 한다 — check-boundaries 참고)
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await query(`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: true, ts: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'error', db: false }, { status: 503 });
  }
}
