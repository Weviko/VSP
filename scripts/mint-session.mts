/**
 * 데모용 세션 발급 (스크린샷·라이브 시연 편의).
 *
 * 업무 역할이 있는 사용자로 로그인한 세션을 하나 만들어 토큰을 출력한다.
 * 브라우저에서 쿠키 `vsp_session=<토큰>` 을 설정하면 OTP 없이 바로 /admin 에 진입한다.
 * (세션 토큰은 DB 에 해시로만 저장되므로, 원본 토큰은 여기서만 볼 수 있다.)
 *
 * 사용:  DATABASE_URL=pglite://.pgdata npx tsx scripts/mint-session.mts
 * 주의:  개발/시연 전용. 운영에서는 실행하지 않는다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne, closePool } from '../packages/core-admin/src/index.ts';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const WORKSPACE_ROLES = ['SYS_ADMIN', 'GOV_ADMIN', 'ORG_HEAD', 'ORG_STAFF', 'ORG_FINANCE', 'ORG_MEDIA'];

type Row = { person_id: string; org_id: string; role_code: string; full_name: string | null };

// 1) 이미 업무 역할이 있는 사람을 찾는다.
let who = await queryOne<Row>(
  `SELECT m.person_id, m.org_id, m.role_code, p.full_name
     FROM core.org_member m
     JOIN core.person p ON p.id = m.person_id
    WHERE m.role_code = ANY($1) AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
    ORDER BY array_position($1, m.role_code)
    LIMIT 1`,
  [WORKSPACE_ROLES]
);

// 2) 없으면 하나 만든다 — 국가연맹 조직에 데모 담당자를 배치한다.
if (!who) {
  const role = await queryOne<{ code: string }>(
    `SELECT code FROM core.role WHERE code = ANY($1) ORDER BY array_position($1, code) LIMIT 1`,
    [WORKSPACE_ROLES]
  );
  const org = await queryOne<{ id: string }>(
    `SELECT id FROM core.organization
      WHERE level_type IN ('SPORTS_AUTH','NATIONAL_FED') AND deleted_at IS NULL
      ORDER BY level_type LIMIT 1`
  );
  if (!role || !org) {
    console.error('업무 역할(core.role) 또는 조직이 없습니다. 먼저 npm run db:reset && npm run demo:all 을 실행하세요.');
    await closePool();
    process.exit(1);
  }
  let person = await queryOne<{ id: string; full_name: string | null }>(
    `SELECT id, full_name FROM core.person WHERE full_name = 'Demo Admin' LIMIT 1`
  );
  if (!person) {
    person = (await query<{ id: string; full_name: string | null }>(
      `INSERT INTO core.person (full_name, phone) VALUES ('Demo Admin', '0900000001') RETURNING id, full_name`
    ))[0];
  }
  await query(
    `INSERT INTO core.org_member (person_id, org_id, role_code, title)
     VALUES ($1,$2,$3,'데모 담당자') ON CONFLICT DO NOTHING`,
    [person.id, org.id, role.code]
  );
  who = { person_id: person.id, org_id: org.id, role_code: role.code, full_name: person.full_name };
}

// 3) 계정 확보 (없으면 생성).
let acc = await queryOne<{ id: string }>(`SELECT id FROM core.account WHERE person_id = $1 LIMIT 1`, [who.person_id]);
if (!acc) {
  const login = `demo-${String(who.person_id).slice(0, 8)}`;
  acc = (await query<{ id: string }>(
    `INSERT INTO core.account (person_id, login_id, auth_provider) VALUES ($1,$2,'LOCAL') RETURNING id`,
    [who.person_id, login]
  ))[0];
}

// 4) 세션 발급 — 원본 토큰은 쿠키로, DB 에는 해시만. active_org_id 로 역할 범위를 잡는다.
const token = randomBytes(32).toString('base64url');
await query(
  `INSERT INTO core.session (token_hash, account_id, person_id, active_org_id, user_agent, expires_at)
   VALUES ($1,$2,$3,$4,'mint-session', now() + interval '30 days')`,
  [sha256(token), acc.id, who.person_id, who.org_id]
);

console.log('\n데모 세션 발급 완료');
console.log(`  사용자 : ${who.full_name ?? who.person_id} (${who.role_code})`);
console.log('\n브라우저에서 아래 쿠키를 설정하면 OTP 없이 /admin 에 진입합니다:');
console.log(`  이름 : vsp_session`);
console.log(`  값   : ${token}`);
console.log('\n예) Playwright: await context.addCookies([{ name:"vsp_session", value:"<위 값>", domain:"localhost", path:"/" }])');
console.log('    또는 브라우저 콘솔에서: document.cookie = "vsp_session=<위 값>; path=/"\n');

await closePool();
process.exit(0);
