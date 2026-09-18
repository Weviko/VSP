/**
 * 공개 데이터 계층 검증.
 *
 * 대외 웹사이트에서 새면 되돌릴 수 없는 것들을 확인한다.
 *   - 보호자 동의 없는 미성년 선수의 이름이 어디에도 나오지 않는다
 *   - 협회 직원·반려된 신청자는 선수 페이지가 없다
 *   - 승인되지 않은 대회와 반려된 참가 신청은 보이지 않는다
 *   - 포털 역할로는 원본 테이블(전화번호·신분증 해시)을 읽을 수 없다
 *
 * 모든 조회는 실제 운영과 같은 조건 — vsp_portal 역할로 전환한 상태 — 에서 돌린다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import {
  query, queryOne, closePool, subscribe,
  setSponsorshipProfile, submitProposal, SponsorshipError, type UUID,
} from '../packages/core-admin/src/index.ts';
import * as pub from '../packages/public-data/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

const TAG = 'PUBTEST';

async function cleanup() {
  await query(`RESET ROLE`);
  // 순위판이 테스트 선수(person)를 참조하므로 person 삭제 전에 먼저 지운다 (cascade 로 순위행까지)
  // season_id IS NULL 로 한정해 데모 시나리오(season 지정) 순위판은 건드리지 않는다.
  await query(
    `DELETE FROM sport.standing_board WHERE league = 'V.League 1' AND season_id IS NULL AND board_code IN ('TEAM_STANDING','PLAYER_BAT')`
  ).catch(() => {});
  const people = `SELECT id FROM core.person WHERE full_name LIKE '${TAG}%'`;
  // 후원(sponsorship)은 person 을 참조하므로 person 삭제 전에 먼저 지운다
  await query(`DELETE FROM sponsorship.proposal WHERE athlete_person_id IN (${people}) OR submitted_by IN (${people})`).catch(() => {});
  await query(`DELETE FROM sponsorship.profile WHERE person_id IN (${people})`).catch(() => {});
  await query(`DELETE FROM core.subscription WHERE person_id IN (${people}) OR target_id IN (${people})`).catch(() => {});
  await query(`DELETE FROM sport.event_result WHERE person_id IN (${people})`);
  await query(`DELETE FROM sport.event_entry WHERE person_id IN (${people})`);
  // 경기 콘텐츠(영상·기사)는 event/match 를 참조하므로 event 삭제 전에 먼저 지운다.
  // 문자중계는 match ON DELETE CASCADE 로 함께 지워진다.
  const evs = `SELECT id FROM sport.event WHERE code LIKE '${TAG}%'`;
  await query(`DELETE FROM content.video WHERE event_id IN (${evs}) OR match_id IN (SELECT id FROM sport.match WHERE event_id IN (${evs}))`).catch(() => {});
  await query(`DELETE FROM content.article WHERE slug LIKE '${TAG}%' OR event_id IN (${evs})`).catch(() => {});
  await query(`DELETE FROM sport.event WHERE code LIKE '${TAG}%'`);
  await query(`DELETE FROM sport.registration WHERE person_id IN (${people})`);
  await query(`DELETE FROM core.consent WHERE person_id IN (${people})`);
  await query(`DELETE FROM core.org_member WHERE person_id IN (${people})`);
  await query(`DELETE FROM core.person WHERE full_name LIKE '${TAG}%'`);
}

async function asPortal<T>(fn: () => Promise<T>): Promise<T> {
  await query(`SET ROLE vsp_portal`);
  try {
    return await fn();
  } finally {
    await query(`RESET ROLE`);
  }
}

await cleanup();

const sport = await queryOne<{ id: UUID }>(`SELECT id FROM sport.sport WHERE status='ACTIVE' LIMIT 1`);
const season = await queryOne<{ id: UUID }>(`SELECT id FROM core.season ORDER BY is_current DESC LIMIT 1`);
const org = await queryOne<{ id: UUID }>(
  `SELECT id FROM core.organization WHERE deleted_at IS NULL AND status='ACTIVE' LIMIT 1`
);
if (!sport || !season || !org) {
  console.log('기준 데이터가 필요합니다. npm run demo 를 먼저 실행하세요.');
  process.exit(1);
}

async function person(name: string, birth: string | null): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(
    `INSERT INTO core.person (full_name, birth_date, gender, phone)
     VALUES ($1, $2, 'M', '0900000000') RETURNING id`,
    [name, birth]
  );
  return r!.id;
}
async function register(personId: UUID, status: string) {
  await query(
    `INSERT INTO sport.registration (person_id, season_id, sport_id, reg_type, org_id, status)
     VALUES ($1, $2, $3, 'ATHLETE', $4, $5)`,
    [personId, season!.id, sport!.id, org!.id, status]
  );
}

const thisYear = new Date().getFullYear();
const adult = await person(`${TAG} Nguyễn Văn Trưởng`, `${thisYear - 25}-03-01`);
const minor = await person(`${TAG} Trần Thị Nhỏ`, `${thisYear - 14}-06-01`);
const minorOk = await person(`${TAG} Lê Văn Đồng`, `${thisYear - 15}-06-01`);
const noBirth = await person(`${TAG} Phạm Không Rõ`, null);
const staff = await person(`${TAG} Hoàng Nhân Viên`, `${thisYear - 40}-01-01`);
const rejected = await person(`${TAG} Vũ Bị Từ Chối`, `${thisYear - 30}-01-01`);

await register(adult, 'APPROVED');
await register(minor, 'APPROVED');
await register(minorOk, 'APPROVED');
await register(noBirth, 'APPROVED');
await register(rejected, 'REJECTED');
await query(
  `INSERT INTO core.org_member (person_id, org_id, role_code) VALUES ($1, $2, 'ORG_STAFF')`,
  [staff, org.id]
);
await query(
  `INSERT INTO core.consent (person_id, consent_type, version, granted, guardian_name)
   VALUES ($1, 'PORTRAIT', 'v1', true, 'Lê Văn Cha')`,
  [minorOk]
);

async function event(code: string, approval: string, isPublic: boolean): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(
    `INSERT INTO sport.event (code, name_i18n, sport_id, season_id, host_org_id,
                              approval_status, is_public, starts_on, ends_on, status)
     VALUES ($1, '{"vi":"Giải thử nghiệm"}', $2, $3, $4, $5, $6,
             CURRENT_DATE - 3, CURRENT_DATE - 1, 'FINISHED')
     RETURNING id`,
    [code, sport.id, season.id, org.id, approval, isPublic]
  );
  return r!.id;
}
const openEvent = await event(`${TAG}-OPEN`, 'APPROVED', true);
const pendingEvent = await event(`${TAG}-PENDING`, 'SUBMITTED', true);
const hiddenEvent = await event(`${TAG}-HIDDEN`, 'APPROVED', false);

async function entry(personId: UUID, status: string) {
  await query(
    `INSERT INTO sport.event_entry (event_id, person_id, submitted_org_id, status)
     VALUES ($1, $2, $3, $4)`,
    [openEvent, personId, org.id, status]
  );
}
await entry(adult, 'CONFIRMED');
await entry(minor, 'CONFIRMED');
await entry(rejected, 'REJECTED');
await query(
  `INSERT INTO sport.event_result (event_id, person_id, org_id, final_rank, medal)
   VALUES ($1, $2, $3, 1, 'GOLD'), ($1, $4, $3, 2, 'SILVER')`,
  [openEvent, minor, org.id, adult]
);

// 경기 상세용 경기 1건 (종목별 기록표 box_score 포함)
const box = { columns: ['1', '2', '3', 'T'], rows: [
  { side: 'A', label: 'Team A', cells: ['1', '0', '2', '3'] },
  { side: 'B', label: 'Team B', cells: ['0', '1', '0', '1'] },
] };
const match = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.match (event_id, round_name, match_no, status, box_score)
   VALUES ($1, 'Chung kết', 'M1', 'FINISHED', $2::jsonb) RETURNING id`,
  [openEvent, JSON.stringify(box)]
);
await query(
  `INSERT INTO sport.match_participant (match_id, side, score, result)
   VALUES ($1, 'A', 3, 'WIN'), ($1, 'B', 1, 'LOSE')`,
  [match!.id]
);

// 경기 콘텐츠(문서 14 §5-B): 문자중계·영상·뉴스 — 공개(승인) 경기만 노출되는지 본다.
await query(
  `INSERT INTO content.match_relay (match_id, seq, clock, side, kind, text_i18n) VALUES
     ($1, 1, '3''',  'A', 'GOAL', '{"vi":"Bàn thắng mở tỉ số","ko":"선제골"}'::jsonb),
     ($1, 2, '45''', NULL, 'PERIOD', '{"vi":"Hết hiệp 1","ko":"전반 종료"}'::jsonb),
     ($1, 3, '78''', 'B', 'GOAL', '{"vi":"Gỡ hòa hụt","ko":"만회골"}'::jsonb)`,
  [match!.id]
);
// 비공개 대회의 경기 + 그 중계 → 공개 쪽에 새면 안 된다
const hiddenMatch = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.match (event_id, round_name, match_no, status)
   VALUES ($1, 'Vòng bảng', 'H1', 'FINISHED') RETURNING id`,
  [hiddenEvent]
);
await query(
  `INSERT INTO content.match_relay (match_id, seq, kind, text_i18n)
   VALUES ($1, 1, 'INFO', '{"vi":"bí mật"}'::jsonb)`,
  [hiddenMatch!.id]
);
// 영상 3건: 공개 경기(게시)·초안·비공개 대회(게시) — 첫 번째만 노출돼야 한다
await query(
  `INSERT INTO content.video (match_id, event_id, sport_id, title_i18n, provider, external_id, status) VALUES
     ($1, $2, $3, '{"vi":"Highlight","ko":"하이라이트"}'::jsonb, 'YOUTUBE', 'abc123', 'PUBLISHED'),
     ($1, $2, $3, '{"vi":"Nháp"}'::jsonb, 'YOUTUBE', 'draft1', 'DRAFT'),
     (NULL, $4, $3, '{"vi":"Ẩn"}'::jsonb, 'YOUTUBE', 'hid1', 'PUBLISHED')`,
  [match!.id, openEvent, sport.id, hiddenEvent]
);
// 기사 2건: 게시(공개 대회) + 초안 — 게시된 것만 노출, 언론사명만 바이라인
await query(
  `INSERT INTO content.article (slug, title_i18n, summary_i18n, body_i18n, source, event_id, sport_id, author_org_id, status, published_at)
   VALUES
     ($1, '{"vi":"Tin đã đăng","ko":"게시 기사"}'::jsonb, '{"vi":"tóm tắt"}'::jsonb, '{"vi":"nội dung"}'::jsonb, 'PRESS', $3, $4, $5, 'PUBLISHED', now()),
     ($2, '{"vi":"Bản nháp"}'::jsonb, NULL, '{"vi":"nháp"}'::jsonb, 'AUTO', $3, $4, NULL, 'DRAFT', NULL)`,
  [`${TAG}-a1`, `${TAG}-a2`, openEvent, sport.id, org.id]
);

// 순위판 2개: 팀 순위(라벨) + 개인기록(미성년 선수 → 마스킹 확인)
const teamBoard = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.standing_board (sport_id, league, board_code, name_i18n, entity, columns)
   VALUES ($1, 'V.League 1', 'TEAM_STANDING', '{"vi":"BXH đội","ko":"팀 순위"}', 'TEAM', '["P","W","L"]'::jsonb)
   RETURNING id`,
  [sport.id]
);
await query(
  `INSERT INTO sport.standing_entry (board_id, rank, label, cells) VALUES
     ($1, 1, 'Team A', '["10","8","2"]'::jsonb), ($1, 2, 'Team B', '["10","5","5"]'::jsonb)`,
  [teamBoard!.id]
);
const playerBoard = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.standing_board (sport_id, league, board_code, name_i18n, entity, columns, sort_order)
   VALUES ($1, 'V.League 1', 'PLAYER_BAT', '{"vi":"Ghi bàn","ko":"득점"}', 'PLAYER', '["G"]'::jsonb, 1)
   RETURNING id`,
  [sport.id]
);
await query(
  `INSERT INTO sport.standing_entry (board_id, rank, person_id, cells)
   VALUES ($1, 1, $2, '["9"]'::jsonb)`,
  [playerBoard!.id, minor]
);

// 구독 2건 (MY팀) — 공개 집계로 구독자 수만 나오는지 본다
await subscribe(adult, 'SPORT', sport.id);
await subscribe(minor, 'SPORT', sport.id);

// 후원 중개 (문서 06): 성인 선수만 프로필을 열 수 있고, 공개 쪽엔 연락처가 없다.
await setSponsorshipProfile(adult, { isOpen: true, headlineI18n: { vi: 'VĐV thử nghiệm', ko: '테스트 선수' } });
// 성인 선수를 개인 구독(PERSON)해서 인기 지표(팔로워)가 후원 목록에 반영되는지 본다
await subscribe(minorOk, 'PERSON', adult);
// 열린 선수에게 후원 제안 1건 — 연락처는 비공개(본인만)여야 한다
await submitProposal({
  athletePersonId: adult, sponsorName: `${TAG} Sponsor Co`,
  sponsorContact: 'secret@sponsor.example', budget: '50-100M', submittedBy: minorOk,
});
// 가드: 미성년·비선수는 프로필을 열 수 없다
let minorGuard = false;
try { await setSponsorshipProfile(minor, { isOpen: true }); } catch (e) { minorGuard = e instanceof SponsorshipError && e.code === 'MINOR'; }
let staffGuard = false;
try { await setSponsorshipProfile(staff, { isOpen: true }); } catch (e) { staffGuard = e instanceof SponsorshipError && e.code === 'NO_ATHLETE'; }

console.log('\n[1] 포털 역할의 경계');
await asPortal(async () => {
  let blocked = false;
  try {
    await query(`SELECT phone, id_doc_hash FROM core.person LIMIT 1`);
  } catch {
    blocked = true;
  }
  check('원본 사람 테이블(전화·신분증 해시)은 읽을 수 없다', blocked);

  let writeBlocked = false;
  try {
    await query(`UPDATE sport.registration SET status='APPROVED' WHERE person_id = $1`, [rejected]);
  } catch {
    writeBlocked = true;
  }
  check('원본 테이블에 쓸 수 없다', writeBlocked);

  let pubSrcBlocked = false;
  try {
    await query(`SELECT * FROM pub_src.person_label LIMIT 1`);
  } catch {
    pubSrcBlocked = true;
  }
  check('내부 재료 뷰(pub_src)는 읽을 수 없다', pubSrcBlocked);

  // 헬스체크 핑은 읽기 전용 롤로도 성공해야 한다(로드밸런서가 이걸로 살아있음을 판단)
  check('헬스체크 pingDb() 성공', (await pub.pingDb()) === true);
});

console.log('\n[2] 선수 공개 범위');
await asPortal(async () => {
  check('성인 선수는 공개', (await pub.getAthlete(adult)) !== null);
  check('보호자 동의 없는 미성년은 비공개', (await pub.getAthlete(minor)) === null);
  check('보호자 동의가 있는 미성년은 공개', (await pub.getAthlete(minorOk)) !== null);
  check('생년월일 없는 선수는 비공개 (미성년일 수 있다)', (await pub.getAthlete(noBirth)) === null);
  check('협회 직원은 선수 페이지가 없다', (await pub.getAthlete(staff)) === null);
  check('반려된 신청자는 선수 페이지가 없다', (await pub.getAthlete(rejected)) === null);
  check('uuid 가 아닌 주소는 오류가 아니라 없음', (await pub.getAthlete('../../etc')) === null);

  const a = await pub.getAthlete(adult);
  check('생년월일 대신 출생연도만', a !== null && a.birth_year === thisYear - 25 && !('birth_date' in a));

  const found = await pub.searchAthletes({ name: 'nguyen van truong', pageSize: 100 });
  check('성조 없이 검색해도 찾는다', found.rows.some((r) => r.person_id === adult));

  const everyone = await pub.searchAthletes({ name: 'pubtest', pageSize: 100 });
  const ids = new Set(everyone.rows.map((r) => r.person_id));
  check('검색 결과에 미성년(동의 없음) 없음', !ids.has(minor));
  check('검색 결과에 직원·반려자 없음', !ids.has(staff) && !ids.has(rejected));

  const bySport = await pub.listAthleteRegistrations({ sportId: sport.id, limit: 1000 });
  check('종목 선수 명단에 미성년(동의 없음) 없음', !bySport.some((r) => r.person_id === minor));
});

console.log('\n[3] 대회 공개 범위');
await asPortal(async () => {
  check('승인된 공개 대회는 보인다', (await pub.getEvent(openEvent)) !== null);
  check('승인 전 대회는 안 보인다', (await pub.getEvent(pendingEvent)) === null);
  check('비공개 지정 대회는 안 보인다', (await pub.getEvent(hiddenEvent)) === null);

  const entries = await pub.listEntries(openEvent);
  check('반려된 참가 신청은 명단에 없다', entries.length === 2, `got ${entries.length}`);
  const minorEntry = entries.find((e) => e.person_id === null);
  check('미성년 참가자는 머리글자로만', minorEntry?.label === 'P.T.T.N.', minorEntry?.label ?? 'none');
  check('어떤 명단에도 미성년 실명 없음', !entries.some((e) => e.label?.includes('Nhỏ')));

  const results = await pub.listEventResults(openEvent);
  const gold = results.find((r) => r.medal === 'GOLD');
  check('미성년 우승자도 기록은 남는다', gold !== undefined);
  check('미성년 우승자는 프로필로 연결되지 않는다', gold?.person_id === null);
  check('미성년 우승자 실명이 결과표에 없다', !(gold?.label ?? '').includes('Nhỏ'), gold?.label ?? '');

  const history = await pub.listAthleteResults(adult);
  check('성인 선수 성적 이력', history.some((r) => r.medal === 'SILVER'));
  check('미성년 성적 이력은 조회되지 않는다', (await pub.listAthleteResults(minor)).length === 0);

  // 경기 상세 (pub.match 뷰 + box_score) 가 포털 역할로 조회되는지
  const md = await pub.getMatch(match!.id);
  check('경기 상세 조회', md !== null && md.status === 'FINISHED');
  check('종목별 기록표(box_score) 전달', Array.isArray(md?.box_score.columns) && md?.box_score.rows?.length === 2);
  check('참가자 점수·승패', md?.sides.some((s) => s.side === 'A' && s.result === 'WIN') === true);
  const board = await pub.listScoreboard({ limit: 50 });
  check('오늘의 경기에 나타남', board.some((c) => c.match_id === match!.id));
  check('비공개/미승인 대회의 경기는 안 나옴', (await pub.getMatch(crypto.randomUUID())) === null);

  // 순위판 (pub.standing_board / standing_entry)
  const boards = await pub.listStandingBoards({ sportId: sport.id });
  check('순위판 목록 조회', boards.length >= 2, `got ${boards.length}`);
  const teamStd = await pub.getStandings(teamBoard!.id);
  check('팀 순위 표 + 컬럼', teamStd?.board.columns[0] === 'P' && teamStd.entries.length === 2);
  check('팀 순위 라벨·셀', teamStd?.entries[0].label === 'Team A' && teamStd.entries[0].cells[1] === '8');
  const playerStd = await pub.getStandings(playerBoard!.id);
  check('개인기록 미성년 이름 마스킹', !(playerStd?.entries[0].label ?? '').includes('Nhỏ'), playerStd?.entries[0].label ?? '');
  check('개인기록 미성년은 프로필 링크 없음', playerStd?.entries[0].person_id === null);
  check('리그 필터 동작', (await pub.listStandingBoards({ sportId: sport.id, league: 'V.League 1' })).length >= 2);

  // 구독자 수 (MY팀 인기 지표) — 집계만, 누가 구독했는지는 안 나온다
  check('구독자 수 집계', (await pub.subscriberCount('SPORT', sport.id)) >= 2, String(await pub.subscriberCount('SPORT', sport.id)));
  let subWhoBlocked = false;
  try {
    await query(`SELECT person_id FROM core.subscription LIMIT 1`);
  } catch {
    subWhoBlocked = true;
  }
  check('누가 구독했는지는 포털이 못 읽음', subWhoBlocked);
});

console.log('\n[콘텐츠] 경기 상세 — 문자중계·영상·뉴스');
await asPortal(async () => {
  const relay = await pub.listMatchRelay(match!.id);
  check('문자중계 조회(공개 경기)', relay.length >= 3, String(relay.length));
  check('문자중계 최신순 정렬', relay[0]?.seq === 3, String(relay[0]?.seq));
  check('비공개 대회 경기의 중계는 안 나옴', (await pub.listMatchRelay(hiddenMatch!.id)).length === 0);

  const news = await pub.listNews({ eventId: openEvent });
  check('게시 기사만 뉴스에 나옴', news.some((n) => n.slug === `${TAG}-a1`) && !news.some((n) => n.slug === `${TAG}-a2`));
  check('기사 상세(게시)는 열림', (await pub.getArticle(`${TAG}-a1`)) !== null);
  check('초안 기사는 상세로도 안 열림', (await pub.getArticle(`${TAG}-a2`)) === null);
  const a1 = news.find((n) => n.slug === `${TAG}-a1`);
  check('바이라인은 언론사(조직)명', a1 !== undefined && typeof a1.byline_i18n === 'object' && a1.byline_i18n !== null);
  check('기사에 기자 개인명 필드 없음', a1 !== undefined && !('author_person_id' in a1) && !('author_name' in a1));

  const vids = await pub.listVideos({ matchId: match!.id });
  check('공개 경기 영상(게시)만 노출', vids.length === 1 && vids[0].external_id === 'abc123', String(vids.map((v) => v.external_id)));
  check('비공개 대회 영상은 안 나옴', (await pub.listVideos({ eventId: hiddenEvent })).length === 0);
});

console.log('\n[후원] 후원 중개 공개 범위');
check('미성년 선수는 후원 프로필을 열 수 없다 (MINOR)', minorGuard);
check('비선수는 후원 프로필을 열 수 없다 (NO_ATHLETE)', staffGuard);
await asPortal(async () => {
  const open = await pub.listSponsorshipOpen();
  const mine = open.find((o) => o.person_id === adult);
  check('후원 가능(open) 성인 선수는 공개 목록에 있다', mine !== undefined);
  check('미성년(동의 없음)은 후원 목록에 없다', !open.some((o) => o.person_id === minor));
  check('후원 목록에 연락처 필드가 없다', mine !== undefined && !('sponsor_contact' in mine) && !('contact' in mine));
  check('후원 목록에 인기 지표(팔로워) 반영', (mine?.followers ?? 0) >= 1, String(mine?.followers));
  check('후원 한 줄 소개 노출', mine !== undefined && typeof mine.headline_i18n === 'object');

  // 제안 연락처는 포털 역할로 원본 테이블을 읽어도 접근 불가여야 한다
  let proposalBlocked = false;
  try {
    await query(`SELECT sponsor_contact FROM sponsorship.proposal LIMIT 1`);
  } catch {
    proposalBlocked = true;
  }
  check('제안 연락처 원본은 포털이 못 읽음', proposalBlocked);
});

console.log('\n[4] 나머지 공개 조회가 포털 역할로 동작하는지');
await asPortal(async () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ['listSports', () => pub.listSports()],
    ['getSport', () => pub.getSport('taekwondo')],
    ['listSportStats', () => pub.listSportStats()],
    ['listEvents', () => pub.listEvents({ limit: 5 })],
    ['listEvents(finished)', () => pub.listEvents({ finishedOnly: true, limit: 5 })],
    ['listMatches', () => pub.listMatches(openEvent)],
    ['getOrgTree', () => pub.getOrgTree()],
    ['listFederations', () => pub.listFederations()],
    ['listRegionCodes', () => pub.listRegionCodes()],
    ['listGrantDisclosures', () => pub.listGrantDisclosures()],
    ['getStats', () => pub.getStats()],
    ['verifyCertificate', () => pub.verifyCertificate('ABCD-1234-XYZ')],
  ];
  for (const [name, fn] of calls) {
    let err: unknown = null;
    try {
      await fn();
    } catch (e) {
      err = e;
    }
    check(name, err === null, String(err));
  }
});

await cleanup();
await closePool();

console.log(failed === 0
  ? '\n대외 웹사이트는 공개 규칙을 벗어난 데이터를 읽을 수 없다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
