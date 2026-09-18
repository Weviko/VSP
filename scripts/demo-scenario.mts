/**
 * 데모 시나리오 — 전 화면을 "살아 있게" 만드는 최소 스토리 (MCST 미팅용).
 *
 * demo-data.mts 가 만든 조직·종목(43종목) 위에 얹는다:
 *   축구(V.League 1 2026) 대회 1개 · 경기 3개(종료/진행중/예정) · 팀/개인 순위 · 문자중계 ·
 *   영상 · 뉴스 기사 · 후원 가능 선수 · AI 서류 등록 대기 1건.
 *
 * 멱등: 대회(DEMO-VL1-2026)가 이미 있으면 건너뛴다. 다시 깔끔히 심으려면:
 *   npm run db:reset && npm run demo && npm run demo:scenario
 * (또는 npm run demo:scenario -- --force 로 기존 데모 스토리만 지우고 다시 심는다.)
 *
 * 실제 명단·기록을 체육회에서 받으면 이 스크립트는 버린다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import {
  query, queryOne, closePool,
  setSponsorshipProfile, subscribe,
  uploadAttachment, registerExtractor, heuristicExtractor, ingestDocument,
  createPoll, addPollOption, setPollStatus,
  listAdSlots, setSlotActive, createPlacement, setPlacementStatus,
  type UUID,
} from '../packages/core-admin/src/index.ts';

const EVENT_CODE = 'DEMO-VL1-2026';
const force = process.argv.includes('--force');

async function orgByDisplay(id: string): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(`SELECT id FROM core.organization WHERE display_id = $1`, [id]);
  if (!r) throw new Error(`조직 ${id} 이(가) 없습니다. 먼저 npm run demo 를 실행하세요.`);
  return r.id;
}
async function sportByCode(code: string): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(`SELECT id FROM sport.sport WHERE code = $1`, [code]);
  if (!r) throw new Error(`종목 ${code} 이(가) 없습니다. 먼저 npm run demo 를 실행하세요.`);
  return r.id;
}

async function wipeDemo() {
  console.log('  기존 데모 스토리 삭제(--force)');
  const ev = `SELECT id FROM sport.event WHERE code = '${EVENT_CODE}'`;
  const ppl = `SELECT id FROM core.person WHERE external_ids->>'demo' = '1'`;
  await query(`DELETE FROM content.video WHERE event_id IN (${ev}) OR match_id IN (SELECT id FROM sport.match WHERE event_id IN (${ev}))`).catch(() => {});
  await query(`DELETE FROM content.article WHERE slug LIKE 'demo-%'`).catch(() => {});
  await query(`DELETE FROM content.poll WHERE event_id IN (${ev})`).catch(() => {}); // 옵션·표는 cascade
  await query(`DELETE FROM content.cheer WHERE target_type='EVENT' AND target_id IN (${ev})`).catch(() => {});
  await query(`DELETE FROM content.ad_placement WHERE sponsor_name = 'Demo Sponsor Co.'`).catch(() => {});
  await query(`DELETE FROM core.ingestion_job WHERE submitter_person_id IN (${ppl})`).catch(() => {});
  await query(`DELETE FROM sponsorship.proposal WHERE athlete_person_id IN (${ppl}) OR submitted_by IN (${ppl})`).catch(() => {});
  await query(`DELETE FROM sponsorship.profile WHERE person_id IN (${ppl})`).catch(() => {});
  await query(`DELETE FROM core.subscription WHERE person_id IN (${ppl}) OR target_id IN (${ppl})`).catch(() => {});
  await query(`DELETE FROM sport.standing_board WHERE league = 'V.League 1' AND season_id IS NOT NULL`).catch(() => {});
  // 경기→참가자(match_participant.entry_id 가 event_entry 를 RESTRICT 참조)를 먼저 지운 뒤 event 를 지운다.
  await query(`DELETE FROM sport.match WHERE event_id IN (${ev})`).catch(() => {}); // match_participant·match_relay cascade
  await query(`DELETE FROM sport.event_entry WHERE event_id IN (${ev})`).catch(() => {});
  await query(`DELETE FROM sport.event WHERE code = '${EVENT_CODE}'`).catch(() => {});
  await query(`DELETE FROM sport.registration WHERE person_id IN (${ppl})`).catch(() => {});
  // 데모 인물이 제출자인 결재/신청서(+워크플로)를 person 삭제 전에 정리한다.
  const subs = `SELECT id FROM core.form_submission WHERE submitter_person_id IN (${ppl})`;
  await query(`DELETE FROM core.workflow_action WHERE instance_id IN (SELECT id FROM core.workflow_instance WHERE submission_id IN (${subs}))`).catch(() => {});
  await query(`DELETE FROM core.workflow_instance WHERE submission_id IN (${subs})`).catch(() => {});
  await query(`UPDATE content.article SET review_submission_id = NULL WHERE review_submission_id IN (${subs})`).catch(() => {});
  await query(`DELETE FROM core.form_submission WHERE submitter_person_id IN (${ppl})`).catch(() => {});
  await query(`DELETE FROM core.consent WHERE person_id IN (${ppl})`).catch(() => {});
  await query(`DELETE FROM core.attachment WHERE owner_id IN (${ppl}) AND file_name LIKE 'demo-%'`).catch(() => {});
  await query(`DELETE FROM core.person WHERE external_ids->>'demo' = '1'`).catch(() => {});
  await query(`DELETE FROM sport.team WHERE short_name LIKE 'DEMO-%'`).catch(() => {});
}

const existing = await queryOne<{ id: UUID }>(`SELECT id FROM sport.event WHERE code = $1`, [EVENT_CODE]);
if (existing && !force) {
  console.log('\n  데모 시나리오가 이미 있습니다. 건너뜁니다. (다시 깔려면 --force 또는 db:reset)\n');
  await closePool();
  process.exit(0);
}
if (force) await wipeDemo();

console.log('\n데모 시나리오 생성:');

// ── 기준 데이터 ──────────────────────────────────────────────────────────
const football = await sportByCode('FOOTBALL');
const fedFtb = await orgByDisplay('FED-FTB');
const hn = await orgByDisplay('FED-FTB-HN');
const hcm = await orgByDisplay('FED-FTB-HCM');

let season = await queryOne<{ id: UUID }>(`SELECT id FROM core.season ORDER BY is_current DESC, starts_on DESC LIMIT 1`);
if (!season) {
  season = await queryOne<{ id: UUID }>(
    `INSERT INTO core.season (code, name_i18n, starts_on, ends_on, is_current)
     VALUES ('2026', '{"vi":"Mùa giải 2026","ko":"2026 시즌"}'::jsonb, '2026-01-01', '2026-12-31', true) RETURNING id`
  );
}
const seasonId = season!.id;

// ── 팀 ───────────────────────────────────────────────────────────────────
async function team(nameVi: string, nameKo: string, short: string, orgId: UUID): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(
    `INSERT INTO sport.team (org_id, sport_id, name_i18n, short_name)
     VALUES ($1, $2, $3::jsonb, $4) RETURNING id`,
    [orgId, football, JSON.stringify({ vi: nameVi, ko: nameKo }), short]
  );
  return r!.id;
}
const teamHN = await team('CLB Bóng đá Hà Nội', '하노이 FC', 'DEMO-HN', hn);
const teamHCM = await team('CLB TP. Hồ Chí Minh', '호치민시 FC', 'DEMO-HCM', hcm);
console.log('  팀 2개');

// ── 선수 (성인, 승인된 축구 선수 → 공개) ──────────────────────────────────
const YEAR = new Date().getFullYear();
async function athlete(nameVi: string, nameLatin: string, birthYear: number, orgId: UUID): Promise<UUID> {
  const p = await queryOne<{ id: UUID }>(
    `INSERT INTO core.person (full_name, name_latin, gender, birth_date, phone, external_ids)
     VALUES ($1, $2, 'M', $3, '0900000000', '{"demo":"1"}'::jsonb) RETURNING id`,
    [nameVi, nameLatin, `${birthYear}-05-10`]
  );
  await query(
    `INSERT INTO sport.registration (person_id, season_id, sport_id, reg_type, org_id, status)
     VALUES ($1, $2, $3, 'ATHLETE', $4, 'APPROVED')`,
    [p!.id, seasonId, football, orgId]
  );
  return p!.id;
}
const quyet = await athlete('Nguyễn Văn Quyết', 'Nguyen Van Quyet', YEAR - 33, hn);
const dung = await athlete('Đỗ Hùng Dũng', 'Do Hung Dung', YEAR - 31, hn);
const linh = await athlete('Nguyễn Tiến Linh', 'Nguyen Tien Linh', YEAR - 28, hcm);
const phuong = await athlete('Nguyễn Công Phượng', 'Nguyen Cong Phuong', YEAR - 30, hcm);
console.log('  선수 4명');

// ── 대회 ───────────────────────────────────────────────────────────────────
const event = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.event
     (code, name_i18n, sport_id, season_id, host_org_id, approval_status, approved_at,
      event_level, event_type, is_ranked, is_public, starts_on, ends_on, venue_text, decision_no)
   VALUES ($1, $2::jsonb, $3, $4, $5, 'APPROVED', now(), 'NATIONAL', 'LEAGUE', true, true,
           CURRENT_DATE - 30, CURRENT_DATE + 60, 'Toàn quốc', 'QĐ-DEMO/2026')
   RETURNING id`,
  [EVENT_CODE, JSON.stringify({ vi: 'V.League 1 2026 (Demo)', ko: 'V.리그1 2026 (데모)' }),
   football, seasonId, fedFtb]
);
const eventId = event!.id;

// 팀 참가(확정) — 경기 참가자 라벨의 근거
async function entry(teamId: UUID, orgId: UUID): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(
    `INSERT INTO sport.event_entry (event_id, entry_type, team_id, submitted_org_id, status)
     VALUES ($1, 'TEAM', $2, $3, 'CONFIRMED') RETURNING id`,
    [eventId, teamId, orgId]
  );
  return r!.id;
}
const enHN = await entry(teamHN, hn);
const enHCM = await entry(teamHCM, hcm);
console.log('  대회 1개 (V.League 1 2026)');

// ── 경기 3개 ───────────────────────────────────────────────────────────────
async function match(round: string, no: string, when: string, status: string, box: object): Promise<UUID> {
  const r = await queryOne<{ id: UUID }>(
    `INSERT INTO sport.match (event_id, round_name, match_no, scheduled_at, status, box_score)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
    [eventId, round, no, when, status, JSON.stringify(box)]
  );
  return r!.id;
}
async function part(matchId: UUID, entryId: UUID, side: string, score: number | null, result: string | null) {
  await query(
    `INSERT INTO sport.match_participant (match_id, entry_id, side, score, result)
     VALUES ($1, $2, $3, $4, $5)`,
    [matchId, entryId, side, score, result]
  );
}

// 종료 경기 (기록표 + 참가자 + 중계 + 영상 + 기사)
const m1 = await match('Vòng 5', 'V5-01', new Date(Date.now() - 3 * 864e5).toISOString(), 'FINISHED', {
  columns: ['H1', 'H2', 'T'],
  rows: [
    { side: 'A', label: 'Hà Nội', cells: ['1', '1', '2'] },
    { side: 'B', label: 'TP.HCM', cells: ['0', '1', '1'] },
  ],
});
await part(m1, enHN, 'A', 2, 'WIN');
await part(m1, enHCM, 'B', 1, 'LOSE');

// 진행 중 경기
const m2 = await match('Vòng 6', 'V6-03', new Date().toISOString(), 'LIVE', {});
await part(m2, enHCM, 'A', 1, null);
await part(m2, enHN, 'B', 1, null);

// 예정 경기
const m3 = await match('Vòng 6', 'V6-05', new Date(Date.now() + 2 * 864e5).toISOString(), 'SCHEDULED', {});
await part(m3, enHN, 'A', null, null);
await part(m3, enHCM, 'B', null, null);
console.log('  경기 3개 (종료/진행중/예정)');

// ── 문자중계 ────────────────────────────────────────────────────────────────
async function relay(matchId: UUID, rows: Array<[number, string | null, string | null, string, string, string]>) {
  for (const [seq, clock, side, kind, vi, ko] of rows) {
    await query(
      `INSERT INTO content.match_relay (match_id, seq, clock, side, kind, text_i18n)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [matchId, seq, clock, side, kind, JSON.stringify({ vi, ko })]
    );
  }
}
await relay(m1, [
  [1, "1'", null, 'PERIOD', 'Trận đấu bắt đầu', '경기 시작'],
  [2, "23'", 'A', 'GOAL', 'Văn Quyết mở tỉ số cho Hà Nội', '반 꾸엣 선제골 (하노이)'],
  [3, "45'", null, 'PERIOD', 'Hết hiệp 1: Hà Nội 1-0 TP.HCM', '전반 종료: 하노이 1-0 호치민'],
  [4, "58'", 'B', 'GOAL', 'Tiến Linh gỡ hòa cho TP.HCM', '띠엔 린 동점골 (호치민)'],
  [5, "71'", 'A', 'GOAL', 'Hùng Dũng đưa Hà Nội vượt lên 2-1', '흥 중 역전골 (하노이)'],
  [6, "90'+3", null, 'INFO', 'Kết thúc: Hà Nội 2-1 TP.HCM', '경기 종료: 하노이 2-1 호치민'],
]);
await relay(m2, [
  [1, "1'", null, 'PERIOD', 'Trận đấu bắt đầu', '경기 시작'],
  [2, "18'", 'A', 'GOAL', 'TP.HCM vượt lên dẫn trước', '호치민 선제골'],
  [3, "36'", 'B', 'GOAL', 'Hà Nội cân bằng tỉ số', '하노이 동점골'],
]);
console.log('  문자중계 2경기');

// ── 영상 ────────────────────────────────────────────────────────────────────
await query(
  `INSERT INTO content.video (match_id, event_id, sport_id, title_i18n, provider, external_id, duration_seconds, sort_order, status)
   VALUES
     ($1, $2, $3, $4::jsonb, 'YOUTUBE', 'aqz-KE-bpKQ', 154, 0, 'PUBLISHED'),
     (NULL, $2, $3, $5::jsonb, 'YOUTUBE', 'aqz-KE-bpKQ', 92, 1, 'PUBLISHED')`,
  [m1, eventId, football,
   JSON.stringify({ vi: 'Highlight: Hà Nội 2-1 TP.HCM', ko: '하이라이트: 하노이 2-1 호치민' }),
   JSON.stringify({ vi: 'Tổng hợp vòng 5 V.League 1', ko: 'V.리그1 5R 모아보기' })]
);
console.log('  영상 2개');

// ── 뉴스 기사 ────────────────────────────────────────────────────────────────
const recapBody = [
  'Trên sân nhà, CLB Hà Nội đã có chiến thắng 2-1 trước TP.HCM trong khuôn khổ vòng 5 V.League 1 2026.',
  'Nguyễn Văn Quyết mở tỉ số ở phút 23. Sau khi Tiến Linh gỡ hòa, Hùng Dũng ấn định chiến thắng cho đội chủ nhà.',
  'Kết quả này giúp Hà Nội tiếp tục dẫn đầu bảng xếp hạng.',
].join('\n\n');
await query(
  `INSERT INTO content.article (slug, title_i18n, summary_i18n, body_i18n, source, event_id, sport_id, author_org_id, tags, status, published_at)
   VALUES
     ($1, $2::jsonb, $3::jsonb, $4::jsonb, 'PRESS', $7, $8, $9, ARRAY['V.League','Hà Nội'], 'PUBLISHED', now()),
     ($5, $6::jsonb, NULL, $10::jsonb, 'AUTO', $7, $8, NULL, ARRAY['V.League'], 'PUBLISHED', now() - interval '1 day')`,
  [
    'demo-vl1-recap',
    JSON.stringify({ vi: 'Hà Nội thắng TP.HCM 2-1, giữ ngôi đầu', ko: '하노이 2-1 승리, 선두 유지' }),
    JSON.stringify({ vi: 'Văn Quyết và Hùng Dũng lập công cho đội chủ nhà.', ko: '반 꾸엣·흥 중 득점.' }),
    JSON.stringify({ vi: recapBody, ko: '하노이가 홈에서 호치민을 2-1로 꺾고 선두를 지켰다.' }),
    'demo-vl1-preview',
    JSON.stringify({ vi: 'Lịch thi đấu vòng 6 V.League 1', ko: 'V.리그1 6R 일정' }),
    eventId, football, fedFtb,
    JSON.stringify({ vi: 'Vòng 6 diễn ra cuối tuần này với nhiều trận đáng chú ý.', ko: '6라운드가 이번 주말 열린다.' }),
  ]
);
console.log('  뉴스 기사 2개');

// ── 순위판 ───────────────────────────────────────────────────────────────────
const teamBoard = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.standing_board (sport_id, season_id, league, board_code, name_i18n, entity, columns, sort_order)
   VALUES ($1, $2, 'V.League 1', 'TEAM_STANDING', $3::jsonb, 'TEAM', $4::jsonb, 0) RETURNING id`,
  [football, seasonId, JSON.stringify({ vi: 'Bảng xếp hạng', ko: '팀 순위' }),
   JSON.stringify(['Trận', 'T', 'H', 'B', 'Đ'])]
);
await query(
  `INSERT INTO sport.standing_entry (board_id, rank, team_id, cells) VALUES
     ($1, 1, $2, '["5","4","1","0","13"]'::jsonb),
     ($1, 2, $3, '["5","3","1","1","10"]'::jsonb)`,
  [teamBoard!.id, teamHN, teamHCM]
);
await query(
  `INSERT INTO sport.standing_entry (board_id, rank, label, cells) VALUES
     ($1, 3, 'CLB Nam Định', '["5","2","2","1","8"]'::jsonb),
     ($1, 4, 'CLB Bình Dương', '["5","2","1","2","7"]'::jsonb)`,
  [teamBoard!.id]
);
const scorerBoard = await queryOne<{ id: UUID }>(
  `INSERT INTO sport.standing_board (sport_id, season_id, league, board_code, name_i18n, entity, columns, sort_order)
   VALUES ($1, $2, 'V.League 1', 'SCORER', $3::jsonb, 'PLAYER', $4::jsonb, 1) RETURNING id`,
  [football, seasonId, JSON.stringify({ vi: 'Vua phá lưới', ko: '득점 순위' }), JSON.stringify(['Bàn'])]
);
await query(
  `INSERT INTO sport.standing_entry (board_id, rank, person_id, cells) VALUES
     ($1, 1, $2, '["9"]'::jsonb), ($1, 2, $3, '["7"]'::jsonb)`,
  [scorerBoard!.id, linh, quyet]
);
console.log('  순위판 2개 (팀/득점)');

// ── 후원 ─────────────────────────────────────────────────────────────────────
await setSponsorshipProfile(quyet, {
  isOpen: true,
  headlineI18n: { vi: 'Tiền đạo kỳ cựu, đội trưởng CLB Hà Nội', ko: '베테랑 공격수, 하노이 FC 주장' },
});
// 인기 지표(팔로워)와 종목 구독
await subscribe(dung, 'PERSON', quyet);
await subscribe(linh, 'PERSON', quyet);
await subscribe(phuong, 'PERSON', quyet);
await subscribe(dung, 'SPORT', football);
await subscribe(linh, 'SPORT', football);
console.log('  후원 가능 선수 1명 (+팔로워)');

// ── 팬 투표 + 응원 ────────────────────────────────────────────────────────────
const poll = await createPoll(
  { titleI18n: { vi: 'Cầu thủ xuất sắc nhất vòng 5', ko: '5R MVP' }, pollType: 'MVP', eventId },
  quyet
);
await addPollOption(poll.id, { personId: quyet, labelI18n: { vi: 'Nguyễn Văn Quyết', ko: '반 꾸엣' } });
await addPollOption(poll.id, { personId: linh, labelI18n: { vi: 'Nguyễn Tiến Linh', ko: '띠엔 린' } });
await addPollOption(poll.id, { personId: dung, labelI18n: { vi: 'Đỗ Hùng Dũng', ko: '흥 중' } });
await setPollStatus(poll.id, 'OPEN', quyet);
console.log('  팬 투표 1개 (MVP, 열림)');

// ── 광고 (HOME_TOP 켜고 데모 게재 1건) ────────────────────────────────────────
const homeTop = (await listAdSlots()).find((s) => s.code === 'HOME_TOP');
if (homeTop) {
  await setSlotActive(homeTop.id, true, quyet);
  const pl = await createPlacement(
    {
      slotId: homeTop.id,
      sponsorName: 'Demo Sponsor Co.',
      linkUrl: 'https://example.com',
      revenueShareOrgId: fedFtb,
      revenueSharePct: 20,
    },
    quyet
  );
  await setPlacementStatus(pl.id, 'ACTIVE', quyet);
  console.log('  광고 지면 HOME_TOP 활성 + 게재 1건');
}

// ── AI 서류 등록 대기 1건 ────────────────────────────────────────────────────
registerExtractor(heuristicExtractor);
const doc = [
  'full_name: Lê Văn Dũng',
  'name_latin: Le Van Dung',
  'gender: M',
  'birth_date: 2003-08-14',
  'id_doc_no: 001203000456',
  'phone: 0987654321',
].join('\n');
const att = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: quyet,
  fileName: 'demo-don-dang-ky.txt', data: Buffer.from(doc, 'utf8'),
  mimeType: 'text/plain', uploadedBy: quyet,
});
await ingestDocument({
  attachmentId: att.id, formCode: 'ATHLETE_REG',
  subjectType: 'PERSON', submitterPersonId: quyet, submitterOrgId: fedFtb, locale: 'vi',
});
console.log('  AI 서류 등록 대기 1건');

const c = await query<{ ev: number; mt: number; ar: number }>(
  `SELECT (SELECT count(*)::int FROM sport.event WHERE code=$1) AS ev,
          (SELECT count(*)::int FROM sport.match WHERE event_id=$2) AS mt,
          (SELECT count(*)::int FROM content.article WHERE slug LIKE 'demo-%') AS ar`,
  [EVENT_CODE, eventId]
);
console.log(`\n데모 시나리오 생성 완료 — 대회 ${c[0].ev}, 경기 ${c[0].mt}, 기사 ${c[0].ar}.\n`);

await closePool();
