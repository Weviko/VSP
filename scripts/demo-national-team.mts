/**
 * 데모 — 국가대표 선발·관리 (MCST 미팅용).
 *
 * demo·demo:scenario·demo:integrity 위에 얹는다. 실제 워크플로 함수로 심어 시연 포인트를 만든다:
 *   · U23 국가대표팀 + 소집(국제대회 엔트리) 개최 승인
 *   · 후보 지명 시 checkEligibility 자동검증 — 정지(SUSPENDED)된 선수는 '자격 미달'로 표시
 *     (공정·윤리 신고의 징계가 국가대표 선발까지 일관되게 차단됨 = 모듈 간 연결)
 *   · 적격 선수만 선발→확정 → 대외 공개 대표 명부(pub.national_team_member) 노출
 *
 * 멱등: 국가대표팀이 이미 있으면 건너뛴다(--force 로 초기화).
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import { query, queryOne, closePool, type UUID } from '../packages/core-admin/src/index.ts';
import {
  createNationalTeam, createCallup, approveCallup, nominateMember, setMemberStatus, finalizeSquad,
} from '../packages/sport-domain/src/index.ts';

const force = process.argv.includes('--force');

async function main() {
  const existing = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM sport.national_team`);
  if (Number(existing?.n ?? 0) > 0 && !force) {
    console.log('국가대표 데모가 이미 있습니다. 다시 심으려면 --force.');
    await closePool();
    return;
  }
  if (force) await query(`DELETE FROM sport.national_team`); // callup/member 는 CASCADE

  const actorRow = await queryOne<{ person_id: UUID; org_id: UUID }>(
    `SELECT m.person_id, m.org_id FROM core.org_member m
      WHERE (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE) ORDER BY m.role_code LIMIT 1`
  );
  const actor = actorRow ? { personId: actorRow.person_id, orgId: actorRow.org_id } : {};

  // 성인 선수가 가장 많은 종목 + 그 등록 시즌을 고른다 (checkEligibility 가 시즌 일치를 요구).
  const sport = await queryOne<{ sport_id: UUID; season_id: UUID }>(
    `SELECT r.sport_id, r.season_id
       FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.reg_type='ATHLETE' AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
      GROUP BY r.sport_id, r.season_id
      ORDER BY count(*) DESC LIMIT 1`
  );
  if (!sport) { console.log('성인 선수 등록이 없어 국가대표 데모를 건너뜁니다. 먼저 demo:scenario 를 실행하세요.'); await closePool(); return; }

  const fed = await queryOne<{ id: UUID }>(
    `SELECT id FROM core.organization WHERE level_type='NATIONAL_FED' AND deleted_at IS NULL LIMIT 1`
  );

  const teamId = await createNationalTeam(
    { sportId: sport.sport_id, nameI18n: { vi: 'Đội tuyển U23 quốc gia', ko: 'U23 국가대표', en: 'U23 National Team' },
      gender: 'M', ageClass: 'U23', governingOrgId: fed?.id ?? null },
    actor
  );

  const callupId = await createCallup(
    { nationalTeamId: teamId, seasonId: sport.season_id, callupType: 'COMPETITION_ENTRY',
      targetCompetitionNameI18n: { vi: 'SEA Games 2027', en: 'SEA Games 2027', ko: '2027 SEA Games' },
      quota: 5, venueText: 'Hà Nội', startsOn: '2027-05-01', endsOn: '2027-05-20' },
    actor
  );
  await approveCallup(callupId, '2026-대표-001', actor);

  // 후보: 적격(APPROVED) 성인 선수 + 정지(SUSPENDED) 선수 1명(있으면).
  const eligible = await query<{ person_id: UUID; full_name: string }>(
    `SELECT r.person_id, p.full_name
       FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.sport_id=$1 AND r.season_id=$2 AND r.reg_type='ATHLETE' AND r.status='APPROVED'
        AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
      ORDER BY p.full_name LIMIT 5`,
    [sport.sport_id, sport.season_id]
  );
  const suspended = await queryOne<{ person_id: UUID; full_name: string }>(
    `SELECT r.person_id, p.full_name
       FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.sport_id=$1 AND r.season_id=$2 AND r.reg_type='ATHLETE' AND r.status='SUSPENDED' LIMIT 1`,
    [sport.sport_id, sport.season_id]
  );

  let selected = 0;
  for (const a of eligible) {
    const memberId = await nominateMember({ callupId, personId: a.person_id, squadRole: 'ATHLETE' }, actor);
    if (memberId) { await setMemberStatus(memberId, 'SELECTED', actor); selected++; }
  }
  if (suspended) {
    // 정지 선수도 지명해 '자격 미달' 배지를 보여준다 — 선발하지 않는다.
    await nominateMember({ callupId, personId: suspended.person_id, squadRole: 'ATHLETE' }, actor);
  }

  await finalizeSquad(callupId, actor); // SELECTED → CONFIRMED

  console.log('국가대표 데모 생성.');
  console.log(`  · U23 국가대표팀 + 소집(SEA Games 2027 엔트리, 정원 5) 승인·확정`);
  console.log(`  · 적격 선수 ${selected}명 선발→확정(대외 공개 명부 노출)`);
  if (suspended) console.log(`  · 정지 선수 ${suspended.full_name}: 지명 시 '자격 미달'(SUSPENDED) — 선발 불가(공정신고 징계 연동)`);
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
