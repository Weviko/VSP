/**
 * 데이터베이스 준비 — 마이그레이션과 시드를 적용한다.
 *
 * DATABASE_URL 이 가리키는 곳이면 어디든 동작한다.
 *   pglite://.pgdata                          개발 (Docker 불필요, 기본값)
 *   postgresql://user:pw@host:5432/db         운영 / Docker / NAS / 베트남 서버
 *
 *   npm run db:setup             적용
 *   npm run db:setup -- --reset  전부 지우고 다시 적용
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execScript, closePool } from '../packages/core-admin/src/db.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reset = process.argv.includes('--reset');

console.log(`\ntarget: ${process.env.DATABASE_URL!.replace(/:[^:@/]+@/, ':****@')}\n`);

if (reset) {
  console.log('reset: dropping schemas');
  await execScript(`
    DROP SCHEMA IF EXISTS pub CASCADE;
    DROP SCHEMA IF EXISTS pub_src CASCADE;
    DROP SCHEMA IF EXISTS sponsorship CASCADE;
    DROP SCHEMA IF EXISTS grant_mgmt CASCADE;
    DROP SCHEMA IF EXISTS content CASCADE;
    DROP SCHEMA IF EXISTS sport CASCADE;
    DROP SCHEMA IF EXISTS core CASCADE;
    DROP TABLE IF EXISTS _migration;
  `);
}

await execScript(
  `CREATE TABLE IF NOT EXISTS _migration(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`
);

async function applyDir(dir: string, label: string) {
  let files: string[];
  try {
    files = (await readdir(join(root, dir))).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return;
  }
  console.log(`${label}:`);
  for (const f of files) {
    const key = `${dir}/${f}`;
    const done = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM _migration WHERE name = $1`,
      [key]
    );
    if (done[0].n > 0) {
      console.log(`  skip  ${f}`);
      continue;
    }
    process.stdout.write(`  apply ${f} ... `);
    try {
      await execScript(await readFile(join(root, dir, f), 'utf8'));
      await query(`INSERT INTO _migration(name) VALUES ($1)`, [key]);
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.error('    ' + (e instanceof Error ? e.message : String(e)));
      await closePool();
      process.exit(1);
    }
  }
}

await applyDir('db/migrations', 'migrations');
await applyDir('db/seed', 'seed');

await closePool();
console.log('\ndatabase ready.\n');
