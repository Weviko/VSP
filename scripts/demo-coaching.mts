/**
 * 데모 — 지도자 자격·연수 (MCST 미팅용).
 *
 * 등급 3개 + 보수교육 과정 1개 + 지도자 자격 2건(1건은 만료 임박). 보수교육 이수시간을
 * 은행에 쌓아 두어, 데모에서 만료 임박 자격의 '갱신' 버튼이 실제로 동작하게 한다.
 * 공개 지도자(pub.staff)면 대외 /coaches 에 유효 자격이 노출된다.
 * 멱등: 등급이 이미 있으면 건너뛴다(--force).
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import { query, queryOne, closePool, type UUID } from '../packages/core-admin/src/index.ts';
import { upsertGrade, createCourse, enrollCourse, markCompletion, grantCredential } from '../packages/sport-domain/src/index.ts';

const force = process.argv.includes('--force');

async function main() {
  const existing = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM coach.grade`);
  if (Number(existing?.n ?? 0) > 0 && !force) {
    console.log('지도자 자격 데모가 이미 있습니다. 다시 심으려면 --force.');
    await closePool();
    return;
  }
  if (force) { await query(`DELETE FROM coach.credential`); await query(`DELETE FROM coach.course`); await query(`DELETE FROM coach.grade`); }

  const actorRow = await queryOne<{ person_id: UUID; org_id: UUID }>(
    `SELECT m.person_id, m.org_id FROM core.org_member m WHERE (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE) ORDER BY m.role_code LIMIT 1`
  );
  const actor = actorRow ? { personId: actorRow.person_id, orgId: actorRow.org_id } : {};
  const sport = await queryOne<{ id: UUID }>(`SELECT id FROM sport.sport ORDER BY sort_order LIMIT 1`);

  // 등급 3단계 (Level 2/3 은 갱신 시 보수교육 20시간 필요)
  const g1 = await upsertGrade({ code: 'CQ1', nameI18n: { vi: 'HLV cấp 1', ko: '지도자 1급', en: 'Coach Level 1' }, levelOrder: 1, validityYears: 4, refresherHoursRequired: 0 }, actor);
  const g2 = await upsertGrade({ code: 'CQ2', nameI18n: { vi: 'HLV cấp 2', ko: '지도자 2급', en: 'Coach Level 2' }, levelOrder: 2, validityYears: 4, refresherHoursRequired: 20 }, actor);
  await upsertGrade({ code: 'CQ3', nameI18n: { vi: 'HLV cấp 3', ko: '지도자 3급', en: 'Coach Level 3' }, levelOrder: 3, validityYears: 4, refresherHoursRequired: 20 }, actor);

  // 보수교육 과정(20시간, 모집중)
  const courseId = await createCourse(
    { nameI18n: { vi: 'Bồi dưỡng phòng chống doping & an toàn 2026', ko: '2026 보수교육(안전·윤리)', en: 'Refresher 2026 (safety & ethics)' },
      gradeId: g2, sportId: sport?.id ?? null, courseType: 'REFRESHER', hours: 20, capacity: 40, startsOn: '2026-10-05', endsOn: '2026-10-06' },
    actor
  );

  // 공개 지도자 명부가 비지 않도록, 전용 지도자 인물 2명을 만들고 COACH 등록(승인)한다.
  // (기존 선수와 뒤섞지 않는다 — 도핑 정지 선수를 '공개 지도자'로 보이지 않게 한다.)
  const season = await queryOne<{ id: UUID }>(`SELECT id FROM core.season ORDER BY is_current DESC, starts_on DESC LIMIT 1`);
  const org = (actor.orgId ?? (await queryOne<{ id: UUID }>(`SELECT id FROM core.organization WHERE level_type='NATIONAL_FED' AND deleted_at IS NULL LIMIT 1`))?.id) ?? null;

  async function ensureCoach(fullName: string, latin: string, gender: string, birth: string): Promise<{ person_id: UUID; full_name: string }> {
    const existing = await queryOne<{ id: UUID }>(`SELECT id FROM core.person WHERE full_name=$1 AND deleted_at IS NULL LIMIT 1`, [fullName]);
    const personId = existing?.id ?? (await queryOne<{ id: UUID }>(
      `INSERT INTO core.person (full_name, name_latin, gender, birth_date, status) VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING id`,
      [fullName, latin, gender, birth]
    ))!.id;
    if (season && org && sport) {
      await query(
        `INSERT INTO sport.registration (person_id, season_id, sport_id, reg_type, org_id, status, approved_at)
         VALUES ($1,$2,$3,'COACH',$4,'APPROVED',now())
         ON CONFLICT (person_id, season_id, sport_id, reg_type) DO UPDATE SET status='APPROVED', approved_at=now()`,
        [personId, season.id, sport.id, org]
      );
    }
    return { person_id: personId, full_name: fullName };
  }
  const coaches = [
    await ensureCoach('Trần Văn Huấn', 'Tran Van Huan', 'M', '1980-05-10'),
    await ensureCoach('Lê Thị Mai', 'Le Thi Mai', 'F', '1985-08-22'),
  ];

  // 자격 1: Level 2, 만료 임박(취득 ~4년 전) — 갱신 데모용
  const c0 = coaches[0];
  await grantCredential({ personId: c0.person_id, gradeId: g2, sportId: sport?.id ?? null, obtainedOn: '2022-11-01' }, actor);
  // 보수교육 이수(20시간) 은행에 적립 → 갱신 버튼이 동작
  const enrollId = await enrollCourse(courseId, c0.person_id, actor);
  if (enrollId) await markCompletion(enrollId, { status: 'COMPLETED', hoursEarned: 20, score: 95, completedOn: '2026-10-06' }, actor);

  // 자격 2: Level 1, 유효
  if (coaches[1]) {
    await grantCredential({ personId: coaches[1].person_id, gradeId: g1, sportId: sport?.id ?? null, obtainedOn: '2024-05-01' }, actor);
  }

  console.log('지도자 자격 데모 생성.');
  console.log('  · 등급 3단계 + 보수교육 과정 1개(20시간)');
  console.log(`  · 자격 2건 — ${c0.full_name}(2급, 만료 임박·보수교육 20h 적립 → 갱신 가능)`);
  console.log('  · 공개 지도자면 대외 /coaches 에 유효 자격 노출');
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
