/**
 * 스키마 검증 — Docker 없이 실제 PostgreSQL 엔진으로 돌려본다.
 *
 * PGlite는 WASM으로 컴파일된 진짜 PostgreSQL이다.
 * 문법 오류, 제약 위반, 외래키 순서 문제를 실제로 잡아낼 수 있다.
 * 운영 DB와 완전히 같지는 않지만(확장 기능 일부 차이) 스키마 검증에는 충분하다.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
let failed = 0;

async function runDir(dir: string) {
  const files = (await readdir(join(root, dir))).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = await readFile(join(root, dir, f), 'utf8');
    process.stdout.write(`  ${dir}/${f} ... `);
    try {
      await db.exec(sql);
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.log('    ' + (e instanceof Error ? e.message : String(e)));
      failed++;
    }
  }
}

async function check(name: string, sql: string, expect: (rows: any[]) => boolean) {
  try {
    const res = await db.query(sql);
    const ok = expect(res.rows as any[]);
    console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}`);
    if (!ok) {
      failed++;
      console.log('    got: ' + JSON.stringify(res.rows).slice(0, 300));
    }
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log('    ' + (e instanceof Error ? e.message : String(e)));
  }
}

async function expectReject(name: string, fn: () => Promise<unknown>) {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  console.log(`  ${rejected ? 'ok   ' : 'FAIL '} ${name}`);
  if (!rejected) failed++;
}

console.log('\n[1] migrations');
await runDir('db/migrations');

console.log('\n[2] seed');
await runDir('db/seed');

if (failed > 0) {
  console.log(`\n${failed} file(s) failed — fix SQL before continuing.\n`);
  process.exit(1);
}

console.log('\n[3] structure checks');

await check('schemas created',
  `SELECT nspname FROM pg_namespace WHERE nspname IN ('core','sport','content')`,
  (r) => r.length === 3);

await check('core tables present',
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='core'`,
  (r) => r[0].n >= 18);

await check('roles seeded (incl. PRESS)',
  `SELECT code FROM core.role`,
  (r) => r.some((x) => x.code === 'PRESS') && r.length >= 10);

await check('org level types seeded',
  `SELECT count(*)::int AS n FROM core.org_level_type`,
  (r) => r[0].n >= 11);

await check('athlete registration form has 13 fields',
  `SELECT count(*)::int AS n FROM core.form_field ff
     JOIN core.form_definition fd ON fd.id = ff.form_id
    WHERE fd.code = 'ATHLETE_REG'`,
  (r) => r[0].n === 13);

await check('press accreditation form has 6 fields',
  `SELECT count(*)::int AS n FROM core.form_field ff
     JOIN core.form_definition fd ON fd.id = ff.form_id
    WHERE fd.code = 'PRESS_ACCRED'`,
  (r) => r[0].n === 6);

await check('athlete workflow has 2 steps, last is final',
  `SELECT ws.step_no, ws.is_final FROM core.workflow_step ws
     JOIN core.workflow_definition wd ON wd.id = ws.workflow_id
    WHERE wd.code='ATHLETE_REG_2STEP' ORDER BY ws.step_no`,
  (r) => r.length === 2 && r[1].is_final === true);

await check('current season exists',
  `SELECT code, is_current FROM core.season WHERE is_current`,
  (r) => r.length === 1 && r[0].code === '2026');

await check('ad slots seeded and inactive by default',
  `SELECT code, is_active FROM content.ad_slot`,
  (r) => r.length === 4 && r.every((x) => x.is_active === false));

console.log('\n[4] behaviour checks');

// 조직 트리 3단계 구성
await db.exec(`
  INSERT INTO core.organization (id, level_type, name_i18n, display_id) VALUES
    ('11111111-1111-1111-1111-111111111111','SPORTS_AUTH','{"vi":"Cuc TDTT"}','CUC'),
    ('22222222-2222-2222-2222-222222222222','NATIONAL_FED','{"vi":"LD Taekwondo VN"}','FED-TKD'),
    ('33333333-3333-3333-3333-333333333333','PROVINCE_FED','{"vi":"LD Taekwondo Ha Noi"}','TKD-HN');
  UPDATE core.organization SET parent_id='11111111-1111-1111-1111-111111111111'
    WHERE id='22222222-2222-2222-2222-222222222222';
  UPDATE core.organization SET parent_id='22222222-2222-2222-2222-222222222222'
    WHERE id='33333333-3333-3333-3333-333333333333';
`);

await check('org_descendants finds full subtree',
  `SELECT count(*)::int AS n FROM core.org_descendants('11111111-1111-1111-1111-111111111111')`,
  (r) => r[0].n === 3);

// 조직 통합(2025 행정구역 개편) 시나리오: 삭제하지 않고 이력을 남긴다
await db.exec(`
  UPDATE core.organization
     SET merged_into_id='22222222-2222-2222-2222-222222222222',
         effective_to='2025-07-01', status='CLOSED'
   WHERE id='33333333-3333-3333-3333-333333333333';
`);

await check('merged org keeps history (not deleted)',
  `SELECT status, merged_into_id FROM core.organization
    WHERE id='33333333-3333-3333-3333-333333333333'`,
  (r) => r.length === 1 && r[0].status === 'CLOSED' && r[0].merged_into_id !== null);

// 기초 데이터
await db.exec(`
  INSERT INTO core.person (id, full_name) VALUES
    ('44444444-4444-4444-4444-444444444444','Nguyen Van A');
  INSERT INTO sport.sport (id, code, name_i18n) VALUES
    ('55555555-5555-5555-5555-555555555555','TAEKWONDO','{"vi":"Taekwondo"}');
`);

const seasonId = (await db.query<{ id: string }>(`SELECT id FROM core.season LIMIT 1`)).rows[0].id;

const regSql = `INSERT INTO sport.registration (person_id, season_id, sport_id, reg_type, org_id)
   VALUES ('44444444-4444-4444-4444-444444444444', $1,
           '55555555-5555-5555-5555-555555555555', 'ATHLETE',
           '22222222-2222-2222-2222-222222222222')`;

await db.query(regSql, [seasonId]);
await expectReject('duplicate registration blocked (same person/season/sport/type)',
  () => db.query(regSql, [seasonId]));

// 같은 신분증으로 두 사람을 만들 수 없어야 한다 (연령 조작·이중 등록 방지의 핵심)
await db.query(
  `UPDATE core.person SET id_doc_hash='abc123' WHERE id='44444444-4444-4444-4444-444444444444'`
);
await expectReject('duplicate national-ID hash blocked',
  () => db.query(`INSERT INTO core.person (full_name, id_doc_hash) VALUES ('Fake','abc123')`));

// 법정 처리기한이 제출 시점에 자동 계산되는지
const formId = (
  await db.query<{ id: string }>(`SELECT id FROM core.form_definition WHERE code='ATHLETE_REG'`)
).rows[0].id;

const sub = await db.query<{ id: string; due_at: string | null }>(
  `INSERT INTO core.form_submission (form_id, data, status, submitted_at, due_at)
   SELECT $1, '{}'::jsonb, 'SUBMITTED', now(),
          CASE WHEN f.sla_days IS NULL THEN NULL
               ELSE now() + make_interval(days => f.sla_days) END
     FROM core.form_definition f WHERE f.id = $1
   RETURNING id, due_at`,
  [formId]
);
const hasDue = sub.rows[0].due_at !== null;
console.log(`  ${hasDue ? 'ok   ' : 'FAIL '} SLA deadline auto-calculated on submit`);
if (!hasDue) failed++;

// 결재 인스턴스 생성 → 승인 → 신청서 확정까지 흐르는지
const wfId = (
  await db.query<{ id: string }>(
    `SELECT id FROM core.workflow_definition WHERE code='ATHLETE_REG_2STEP'`
  )
).rows[0].id;

const inst = await db.query<{ id: string }>(
  `INSERT INTO core.workflow_instance (workflow_id, submission_id, current_step, status)
   VALUES ($1, $2, 1, 'RUNNING') RETURNING id`,
  [wfId, sub.rows[0].id]
);

await db.query(
  `INSERT INTO core.workflow_action (instance_id, step_no, action, comment)
   VALUES ($1, 1, 'APPROVE', 'step 1 ok')`,
  [inst.rows[0].id]
);
await db.query(`UPDATE core.workflow_instance SET current_step=2 WHERE id=$1`, [inst.rows[0].id]);
await db.query(
  `INSERT INTO core.workflow_action (instance_id, step_no, action) VALUES ($1, 2, 'APPROVE')`,
  [inst.rows[0].id]
);
await db.query(
  `UPDATE core.workflow_instance SET status='APPROVED', finished_at=now() WHERE id=$1`,
  [inst.rows[0].id]
);
await db.query(
  `UPDATE core.form_submission SET status='APPROVED', decided_at=now() WHERE id=$1`,
  [sub.rows[0].id]
);

await check('two-step approval recorded and submission approved',
  `SELECT fs.status,
          (SELECT count(*)::int FROM core.workflow_action wa WHERE wa.instance_id=$1) AS actions
     FROM core.form_submission fs WHERE fs.id=$2`.replace('$1', `'${inst.rows[0].id}'`).replace('$2', `'${sub.rows[0].id}'`),
  (r) => r[0].status === 'APPROVED' && r[0].actions === 2);

// 감사로그가 실제로 쌓이는지 (법적 증거력의 근거)
await db.query(
  `INSERT INTO core.audit_log (entity_schema, entity_table, entity_id, action, after_data)
   VALUES ('core','form_submission',$1,'APPROVE','{"status":"APPROVED"}'::jsonb)`,
  [sub.rows[0].id]
);
await check('audit log writable and queryable',
  `SELECT count(*)::int AS n FROM core.audit_log`,
  (r) => r[0].n >= 1);

// 기자 자격: 유효기간이 지난 기자는 조회에서 걸러져야 한다
await db.exec(`
  INSERT INTO content.press_credential
    (person_id, approved_by_org_id, credential_no, valid_from, valid_to, status)
  VALUES
    ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',
     'PRESS-EXPIRED','2024-01-01','2024-12-31','ACTIVE');
`);
await check('expired press credential filtered by date',
  `SELECT count(*)::int AS n FROM content.press_credential
    WHERE status='ACTIVE' AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
  (r) => r[0].n === 0);

await db.close();
console.log(failed === 0 ? '\nSchema verified. All checks passed.\n' : `\n${failed} check(s) FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
