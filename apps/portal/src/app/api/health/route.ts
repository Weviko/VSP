import { NextResponse } from 'next/server';
import { pingDb } from '@vsp/public-data';

/**
 * 헬스체크 — 로드밸런서/모니터가 인증 없이 친다.
 * 대외 웹사이트의 읽기 전용 DB 경로가 살아있는지 확인한다. 살아있으면 200, 아니면 503.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ok = await pingDb();
    return NextResponse.json({ status: ok ? 'ok' : 'error', db: ok }, { status: ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: 'error', db: false }, { status: 503 });
  }
}
