/**
 * 데모 — 생활체육 클럽 (MCST 미팅용).
 *
 * 지역별 동호회 3개(승인) + 회원 + 프로그램(강좌) + 수강. '우리 동네 동호회 찾기'와
 * 지역별 참여 통계를 대외에서 보여준다. 회원은 core.person(동호인).
 * 멱등: 클럽이 이미 있으면 건너뛴다(--force).
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import { query, queryOne, closePool, type UUID } from '../packages/core-admin/src/index.ts';
import { createClub, approveClub, addClubMember, createClubProgram, enrollMember } from '../packages/sport-domain/src/index.ts';

const force = process.argv.includes('--force');

async function main() {
  const existing = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM sport.club`);
  if (Number(existing?.n ?? 0) > 0 && !force) {
    console.log('생활체육 클럽 데모가 이미 있습니다. 다시 심으려면 --force.');
    await closePool();
    return;
  }
  if (force) await query(`DELETE FROM sport.club`);

  const actorRow = await queryOne<{ person_id: UUID; org_id: UUID }>(
    `SELECT m.person_id, m.org_id FROM core.org_member m WHERE (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE) ORDER BY m.role_code LIMIT 1`
  );
  const actor = actorRow ? { personId: actorRow.person_id, orgId: actorRow.org_id } : {};

  const sport = await queryOne<{ id: UUID }>(`SELECT id FROM sport.sport ORDER BY sort_order LIMIT 1`);
  if (!sport) { console.log('종목이 없어 건너뜁니다.'); await closePool(); return; }

  const regions = (await query<{ region_code: string }>(
    `SELECT DISTINCT region_code FROM core.organization WHERE region_code IS NOT NULL ORDER BY region_code LIMIT 3`
  )).map((r) => r.region_code);
  const R = regions.length ? regions : ['HN', 'HCM', 'DN'];

  const people = await query<{ id: UUID; full_name: string }>(
    `SELECT id, full_name FROM core.person WHERE deleted_at IS NULL AND status='ACTIVE' ORDER BY created_at LIMIT 15`
  );
  if (people.length < 3) { console.log('회원으로 쓸 인물이 부족합니다.'); await closePool(); return; }

  const clubDefs = [
    { name: { vi: 'CLB Bóng đá cộng đồng', ko: '생활축구 동호회', en: 'Community Football Club' }, region: R[0], type: 'COMMUNITY' as const },
    { name: { vi: 'CLB Thể thao phường', ko: '구민 체육 클럽', en: 'Ward Sports Club' }, region: R[1 % R.length], type: 'PUBLIC' as const },
    { name: { vi: 'CLB điểm được chỉ định', ko: '지정 생활체육 클럽', en: 'Designated Sports Club' }, region: R[0], type: 'DESIGNATED' as const },
  ];

  let ci = 0, totalMembers = 0, totalEnroll = 0;
  for (const def of clubDefs) {
    const clubId = await createClub(
      { sportId: sport.id, nameI18n: def.name, regionCode: def.region, clubType: def.type,
        venueText: `${def.region} 체육관`, representativePersonId: people[ci % people.length].id, memberCapacity: 50 },
      actor
    );
    await approveClub(clubId, actor);

    // 회원 3~4명 (첫 명은 대표)
    const memberIds: UUID[] = [];
    for (let k = 0; k < 4; k++) {
      const person = people[(ci * 4 + k) % people.length];
      const mid = await addClubMember({ clubId, personId: person.id, role: k === 0 ? 'LEADER' : 'MEMBER' }, actor);
      if (mid) { memberIds.push(mid); totalMembers++; }
    }

    // 프로그램 + 수강
    const programId = await createClubProgram(
      { clubId, nameI18n: { vi: 'Lớp cơ bản', ko: '기초반', en: 'Basic class' }, category: 'ALL',
        scheduleText: '매주 토 09:00', capacity: 20, startsOn: '2026-10-01', endsOn: '2026-12-20' },
      actor
    );
    for (const mid of memberIds) {
      const e = await enrollMember({ programId, clubMemberId: mid }, actor);
      if (e) totalEnroll++;
    }
    ci++;
  }

  console.log('생활체육 클럽 데모 생성.');
  console.log(`  · 클럽 3개(승인, 지역 ${[...new Set(clubDefs.map(d=>d.region))].join('/')}), 회원 ${totalMembers}명, 프로그램 3개, 수강 ${totalEnroll}건`);
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
