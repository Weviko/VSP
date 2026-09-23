/**
 * 데모 — 도핑방지 (MCST 미팅용).
 *
 * 시연 포인트:
 *   · 도핑방지 교육 과정 + 이수 기록 → registration.eligibility.antidoping 채움(자격 게이트 충족)
 *   · 검사 2건: 음성 1, 양성(AAF) 1
 *   · AAF → 제재(SUSPENSION, 공개) → 등록 SUSPENDED → checkEligibility 출전 차단 + 대외 위반이력 공개
 *
 * 제재 대상은 국가대표 확정 명단에 없는 선수로 골라 대표팀 명부를 흩뜨리지 않는다.
 * 멱등: 교육 과정이 이미 있으면 건너뛴다(--force).
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import { query, queryOne, closePool, type UUID } from '../packages/core-admin/src/index.ts';
import {
  createEducationCourse, recordEducationCompletion, recordTest, recordLabResult, decideSanction,
} from '../packages/sport-domain/src/index.ts';

const force = process.argv.includes('--force');

async function main() {
  const existing = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM antidoping.education_course`);
  if (Number(existing?.n ?? 0) > 0 && !force) {
    console.log('도핑방지 데모가 이미 있습니다. 다시 심으려면 --force.');
    await closePool();
    return;
  }
  if (force) { await query(`DELETE FROM antidoping.sanction`); await query(`DELETE FROM antidoping.test`); await query(`DELETE FROM antidoping.education_record`); await query(`DELETE FROM antidoping.education_course`); }

  const actorRow = await queryOne<{ person_id: UUID; org_id: UUID }>(
    `SELECT m.person_id, m.org_id FROM core.org_member m
      WHERE (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE) ORDER BY m.role_code LIMIT 1`
  );
  const actor = actorRow ? { personId: actorRow.person_id, orgId: actorRow.org_id } : {};

  const sport = await queryOne<{ sport_id: UUID; season_id: UUID }>(
    `SELECT r.sport_id, r.season_id
       FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.reg_type='ATHLETE' AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
      GROUP BY r.sport_id, r.season_id ORDER BY count(*) DESC LIMIT 1`
  );
  if (!sport) { console.log('성인 선수가 없어 건너뜁니다. 먼저 demo:scenario 를 실행하세요.'); await closePool(); return; }

  // 교육 과정 + 이수 2명(확정 명단 선수 포함 가능 — 교육은 자격을 뺏지 않는다)
  const courseId = await createEducationCourse(
    { code: 'ADEL-2026', nameI18n: { vi: 'Giáo dục phòng chống doping cơ bản', ko: '도핑방지 기본교육', en: 'Anti-Doping Basic Education' }, validityMonths: 12, isMandatory: true },
    actor
  );
  const eduAthletes = await query<{ person_id: UUID; full_name: string }>(
    `SELECT r.person_id, p.full_name FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.sport_id=$1 AND r.season_id=$2 AND r.reg_type='ATHLETE' AND r.status='APPROVED'
        AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years' ORDER BY p.full_name LIMIT 2`,
    [sport.sport_id, sport.season_id]
  );
  for (const a of eduAthletes) {
    await recordEducationCompletion({ courseId, personId: a.person_id, sportId: sport.sport_id, score: 90 }, actor);
  }

  // 검사 1: 음성
  if (eduAthletes[0]) {
    const t1 = await recordTest({ personId: eduAthletes[0].person_id, sportId: sport.sport_id, sampleCode: 'SPL-A-0001', testType: 'IN_COMPETITION' }, actor);
    await recordLabResult(t1, { aResult: 'NEG' }, actor);
  }

  // 검사 2: 양성(AAF) → 제재 → 등록 SUSPENDED
  // 가능하면 대표 명단에 없는 성인 선수, 없으면 명단 끝 선수(도핑 위반 → 대표 명부 자동 제외 시연).
  const nonRoster = `SELECT r.person_id, p.full_name, r.sport_id FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.reg_type='ATHLETE' AND r.status='APPROVED' AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
        AND r.person_id NOT IN (SELECT m.person_id FROM sport.nt_member m WHERE m.member_status='CONFIRMED')
      ORDER BY p.full_name LIMIT 1`;
  const anyAthlete = `SELECT r.person_id, p.full_name, r.sport_id FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.reg_type='ATHLETE' AND r.status='APPROVED' AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
      ORDER BY p.full_name DESC LIMIT 1`;
  const target =
    (await queryOne<{ person_id: UUID; full_name: string; sport_id: UUID }>(nonRoster)) ??
    (await queryOne<{ person_id: UUID; full_name: string; sport_id: UUID }>(anyAthlete));
  if (target) {
    const t2 = await recordTest({ personId: target.person_id, sportId: target.sport_id, sampleCode: 'SPL-A-0002', testType: 'OUT_OF_COMPETITION' }, actor);
    await recordLabResult(t2, { aResult: 'POS', bResult: 'POS' }, actor);
    await decideSanction(
      { personId: target.person_id, testId: t2, sanctionType: 'SUSPENSION', adrvArticle: 'ADRV 2.1',
        startsOn: '2026-09-01', endsOn: '2028-08-31', decisionNo: '2026-도핑-001', isPublic: true, sportId: target.sport_id },
      actor
    );
  }

  console.log('도핑방지 데모 생성.');
  console.log(`  · 교육 과정 1개 + 이수 ${eduAthletes.length}명(eligibility.antidoping 채움)`);
  console.log('  · 검사 2건(음성 1, 양성 AAF 1)');
  if (target) console.log(`  · AAF 제재: ${target.full_name} → 자격정지(공개) → 등록 SUSPENDED(출전 자동 차단)`);
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
