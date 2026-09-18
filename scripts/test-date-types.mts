/**
 * 날짜 타입 회귀 테스트.
 *
 * 드라이버가 날짜를 Date 객체로 돌려주면 서버 컴포넌트가 렌더링에 실패하고,
 * 직렬화 과정에서 시간대가 밀려 날짜가 하루 어긋나기도 한다.
 * 타입 선언은 전부 string 이므로 런타임도 string 이어야 한다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import { query, closePool } from '../packages/core-admin/src/db.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

const rows = await query<{
  d: unknown; ts: unknown; tstz: unknown; n: unknown; i: unknown;
}>(
  `SELECT CURRENT_DATE AS d,
          now()::timestamp AS ts,
          now() AS tstz,
          (12345.678)::numeric(12,3) AS n,
          count(*)::int AS i
     FROM core.organization`
);
const r = rows[0];

console.log('\ndriver type mapping');
check('date -> string', typeof r.d === 'string', typeof r.d);
check('timestamp -> string', typeof r.ts === 'string', typeof r.ts);
check('timestamptz -> string', typeof r.tstz === 'string', typeof r.tstz);
check('numeric -> string (precision kept)', typeof r.n === 'string', typeof r.n);
check('int -> number', typeof r.i === 'number', typeof r.i);

// 실제 테이블 컬럼도 확인한다
const org = await query<{ effective_from: unknown; created_at: unknown }>(
  `SELECT effective_from, created_at FROM core.organization LIMIT 1`
);
if (org.length > 0) {
  check('organization.effective_from -> string', typeof org[0].effective_from === 'string',
    typeof org[0].effective_from);
  check('organization.created_at -> string', typeof org[0].created_at === 'string',
    typeof org[0].created_at);
}

await closePool();
console.log(failed === 0 ? '\nDate types OK.\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
