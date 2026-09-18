/**
 * 대회 운영 전 과정 검증.
 * 대회 생성 -> 개최 승인 -> 참가 신청 -> 대진 생성 -> 결과 입력 -> 공개 노출까지.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import {
  query, queryOne, closePool, createOrganization, formatScore, t as pick,
} from '../packages/core-admin/src/index.ts';
import {
  createEvent, approveEvent, addEntry, generateDraw, listMatches,
  recordMatchResult, listEvents, listEntries, getEvent,
  listSports, getSportStats, UnsupportedFormatError,
} from '../packages/sport-domain/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

// 이전 실행 흔적 정리 (대회 관련만)
await query(`TRUNCATE sport.match_participant, sport.match, sport.event_entry,
             sport.event_result, sport.event RESTART IDENTITY CASCADE`);

console.log('\n[1] setup');
const season = await queryOne<{ id: string }>(`SELECT id FROM core.season WHERE is_current LIMIT 1`);
check('current season exists', Boolean(season));

// 이 테스트는 필요한 기준 데이터를 스스로 준비한다 (다른 테스트가 지웠을 수 있다)
let host = await queryOne<{ id: string }>(
  `SELECT id FROM core.organization WHERE level_type='NATIONAL_FED' LIMIT 1`
);
if (!host) {
  const root = await createOrganization({
    levelType: 'SPORTS_AUTH', nameI18n: { vi: 'Cuc TDTT' }, status: 'ACTIVE',
  });
  host = await createOrganization({
    parentId: root.id, levelType: 'NATIONAL_FED',
    nameI18n: { vi: 'Lien doan test' }, status: 'ACTIVE',
  });
}
check('host federation ready', Boolean(host));

let sports = await listSports({ onlyActive: true });
if (sports.length === 0) {
  await query(
    `INSERT INTO sport.sport (code, name_i18n, governing_org_id, is_olympic)
     VALUES ('TESTSPORT', '{"vi":"Mon test"}'::jsonb, $1, true)`,
    [host!.id]
  );
  sports = await listSports({ onlyActive: true });
}
check('sports available', sports.length > 0, `got ${sports.length}`);
const sport = sports[0];

console.log('\n[2] create event');
const ev = await createEvent({
  nameI18n: { vi: 'Giải vô địch quốc gia 2026', ko: '2026 전국선수권' },
  sportId: sport.id,
  seasonId: season!.id,
  hostOrgId: host!.id,
  eventLevel: 'NATIONAL',
  startsOn: '2026-11-01',
  endsOn: '2026-11-05',
  venueText: 'Cung thể thao Hà Nội',
});
check('event created as draft', ev.approval_status === 'DRAFT');
check('not public before approval', ev.is_public === false);

// 승인 전에는 공개 목록에 나오면 안 된다
const publicBefore = await listEvents({ publicOnly: true });
check('hidden from public list before approval',
  !publicBefore.some((e) => e.id === ev.id));

console.log('\n[3] hosting approval');
await approveEvent(ev.id, '123/QD-CTDTT');
const approved = await getEvent(ev.id);
check('approval recorded', approved?.approval_status === 'APPROVED');
check('decision number stored', approved?.decision_no === '123/QD-CTDTT');
check('now public', approved?.is_public === true);

const publicAfter = await listEvents({ publicOnly: true });
check('visible in public list after approval', publicAfter.some((e) => e.id === ev.id));

console.log('\n[4] entries');
const names = ['Nguyen Van A', 'Tran Thi B', 'Le Van C', 'Pham Thi D', 'Hoang Van E'];
const entryIds: string[] = [];
for (const [i, name] of names.entries()) {
  const p = await queryOne<{ id: string }>(
    `INSERT INTO core.person (full_name) VALUES ($1) RETURNING id`, [name]
  );
  const entry = await addEntry({
    eventId: ev.id, personId: p!.id, submittedOrgId: host!.id, seedNo: i + 1,
  });
  entryIds.push(entry.id);
}
const entries = await listEntries(ev.id);
check('5 entries registered', entries.length === 5, `got ${entries.length}`);
check('entry carries person name', Boolean(entries[0].person_name));

console.log('\n[5] draw generation');
const draw = await generateDraw(ev.id, 'TOURNAMENT');
check('matches created for 5 entrants', draw.created === 4, `got ${draw.created}`);
check('bye noted', draw.notes.some((n) => n.includes('bye')), draw.notes.join('; '));

const matches = await listMatches(ev.id);
check('matches readable', matches.length === 4, `got ${matches.length}`);
check('final round present', matches.some((m) => m.round_name === 'FINAL'));

const firstRound = matches.filter((m) => m.participants.every((p) => p.entry_id !== null));
check('first-round matches have both sides', firstRound.length > 0);

console.log('\n[6] record result');
const target = firstRound[0];
const [pa, pb] = target.participants;
await recordMatchResult(target.id, [
  { entryId: pa.entry_id!, score: 21, result: 'WIN' },
  { entryId: pb.entry_id!, score: 15, result: 'LOSE' },
], { deviceRef: 'court-1-tablet' });

const after = (await listMatches(ev.id)).find((m) => m.id === target.id)!;
check('match finished', after.status === 'FINISHED');
check('scores stored', after.participants.some((p) => Number(p.score) === 21),
  JSON.stringify(after.participants.map((p) => p.score)));
check('score displays without trailing zeros',
  formatScore(after.participants.find((p) => Number(p.score) === 21)!.score) === '21',
  formatScore(after.participants[0].score));
check('offline sync marker recorded',
  (await queryOne<{ device_ref: string | null }>(
    `SELECT device_ref FROM sport.match WHERE id=$1`, [target.id]))!.device_ref === 'court-1-tablet');

console.log('\n[7] regeneration safety');
const redraw = await generateDraw(ev.id, 'TOURNAMENT');
const afterRedraw = await listMatches(ev.id);
check('finished match preserved on redraw',
  afterRedraw.some((m) => m.id === target.id && m.status === 'FINISHED'));
check('redraw produced matches', redraw.created > 0);

console.log('\n[8] unimplemented format');
let threw = false;
try {
  await generateDraw(ev.id, 'GROUP_KNOCKOUT');
} catch (e) {
  threw = e instanceof UnsupportedFormatError;
}
check('unsupported format rejected cleanly', threw);

console.log('\n[9] sport stats reflect activity');
const stats = await getSportStats(sport.id);
check('upcoming event counted', stats.upcoming_events >= 1, `got ${stats.upcoming_events}`);

await closePool();
console.log(failed === 0 ? '\nEvent flow passed.\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
