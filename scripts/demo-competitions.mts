/**
 * 데모 — 경기 운영 심화 (MCST 미팅용).
 *
 * 전용 심판 2명(REFEREE 등록) + 경기 심판 배정 + 실시간 기록.
 *   · 경기 A: 주심·부심 배정 + 이벤트 기록(득점·반칙) → 종료 확정(스코어 확정)
 *   · 경기 B: 심판 배정 + LIVE(진행 중, 러닝스코어) — 실시간 콘솔 데모용
 * 공개·승인 대회면 대외 경기 상세에 심판진(pub.match_official)이 노출된다.
 * 멱등: 배정이 이미 있으면 건너뛴다(--force).
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import { query, queryOne, closePool, type UUID } from '../packages/core-admin/src/index.ts';
import { assignMatchOfficial, appendMatchEvent, setMatchStatus, finalizeMatch } from '../packages/sport-domain/src/index.ts';

const force = process.argv.includes('--force');

async function main() {
  const existing = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM sport.match_official`);
  if (Number(existing?.n ?? 0) > 0 && !force) {
    console.log('경기 운영 데모가 이미 있습니다. 다시 심으려면 --force.');
    await closePool();
    return;
  }
  if (force) { await query(`DELETE FROM sport.match_official`); await query(`DELETE FROM sport.match_event`); }

  const actorRow = await queryOne<{ person_id: UUID; org_id: UUID }>(
    `SELECT m.person_id, m.org_id FROM core.org_member m WHERE (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE) ORDER BY m.role_code LIMIT 1`
  );
  const actor = actorRow ? { personId: actorRow.person_id, orgId: actorRow.org_id } : {};

  // 심판 배정 대상 경기(데모 대회) 2건 + 각 경기의 참가자 side.
  const matches = await query<{ id: UUID; sport_id: UUID; season_id: UUID; org_id: UUID }>(
    `SELECT m.id, e.sport_id, e.season_id, e.host_org_id AS org_id
       FROM sport.match m JOIN sport.event e ON e.id = m.event_id
      WHERE e.is_public = true AND e.approval_status = 'APPROVED'
      ORDER BY m.scheduled_at NULLS LAST LIMIT 2`
  );
  if (matches.length === 0) { console.log('공개·승인 대회 경기가 없어 건너뜁니다. 먼저 demo:scenario 를 실행하세요.'); await closePool(); return; }
  const ctx = matches[0];

  async function ensureReferee(fullName: string, latin: string, gender: string, birth: string): Promise<UUID> {
    const existingP = await queryOne<{ id: UUID }>(`SELECT id FROM core.person WHERE full_name=$1 AND deleted_at IS NULL LIMIT 1`, [fullName]);
    const personId = existingP?.id ?? (await queryOne<{ id: UUID }>(
      `INSERT INTO core.person (full_name, name_latin, gender, birth_date, status) VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING id`,
      [fullName, latin, gender, birth]
    ))!.id;
    await query(
      `INSERT INTO sport.registration (person_id, season_id, sport_id, reg_type, org_id, status, license_grade, approved_at)
       VALUES ($1,$2,$3,'REFEREE',$4,'APPROVED',$5,now())
       ON CONFLICT (person_id, season_id, sport_id, reg_type) DO UPDATE SET status='APPROVED', approved_at=now()`,
      [personId, ctx.season_id, ctx.sport_id, ctx.org_id, 'FIFA 1']
    );
    return personId;
  }
  const refA = await ensureReferee('Phạm Văn Trọng', 'Pham Van Trong', 'M', '1978-02-11');
  const refB = await ensureReferee('Hoàng Thị Loan', 'Hoang Thi Loan', 'F', '1983-07-30');

  async function sidesOf(matchId: UUID): Promise<string[]> {
    return (await query<{ side: string | null }>(`SELECT side FROM sport.match_participant WHERE match_id=$1 AND side IS NOT NULL ORDER BY side`, [matchId])).map((r) => r.side!) as string[];
  }

  // 경기 A: 배정 + 기록 + 종료 확정
  const mA = matches[0];
  await assignMatchOfficial({ matchId: mA.id, personId: refA, role: 'CHIEF_REFEREE' }, actor);
  await assignMatchOfficial({ matchId: mA.id, personId: refB, role: 'REFEREE' }, actor);
  const sidesA = await sidesOf(mA.id);
  if (sidesA.length >= 2) {
    await appendMatchEvent(mA.id, { kind: 'PERIOD_START', period: '1' }, actor);
    await appendMatchEvent(mA.id, { kind: 'SCORE', side: sidesA[0], points: 1 }, actor);
    await appendMatchEvent(mA.id, { kind: 'FOUL', side: sidesA[1], note: '경고성 반칙' }, actor);
    await appendMatchEvent(mA.id, { kind: 'SCORE', side: sidesA[0], points: 1 }, actor);
    await appendMatchEvent(mA.id, { kind: 'SCORE', side: sidesA[1], points: 1 }, actor);
    await finalizeMatch(mA.id, actor); // A=2, B=1 확정
  }

  // 경기 B: 배정 + LIVE(진행 중)
  let liveInfo = '없음';
  if (matches[1]) {
    const mB = matches[1];
    await assignMatchOfficial({ matchId: mB.id, personId: refA, role: 'REFEREE' }, actor);
    const sidesB = await sidesOf(mB.id);
    await setMatchStatus(mB.id, 'LIVE', actor);
    if (sidesB.length >= 2) {
      await appendMatchEvent(mB.id, { kind: 'PERIOD_START', period: '1' }, actor);
      await appendMatchEvent(mB.id, { kind: 'SCORE', side: sidesB[0], points: 1 }, actor);
    }
    liveInfo = '경기 B 진행 중(LIVE) + 러닝스코어';
  }

  console.log('경기 운영 데모 생성.');
  console.log('  · 전용 심판 2명(REFEREE 등록) 배정');
  console.log('  · 경기 A: 주심·부심 배정 + 기록 + 종료 확정(스코어 확정)');
  console.log(`  · ${liveInfo}`);
  console.log('  · 공개 대회면 대외 경기 상세에 심판진 노출(pub.match_official)');
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
