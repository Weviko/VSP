/**
 * 구조 경계 검사.
 *
 * 대외 웹사이트와 업무 플랫폼을 나눈 이유는 두 가지다.
 *   1. 대외 웹사이트는 공개 데이터 외에는 읽을 수 없어야 한다
 *   2. 업무 화면·액션은 업무 역할이 있는 사람만 쓸 수 있어야 한다
 *
 * 둘 다 코드 한 줄로 조용히 무너진다 — 누가 편하자고 포털 화면에서 core-admin 을 import 하거나,
 * 새 업무 화면을 만들면서 권한 확인을 빠뜨리면 끝이다. 리뷰에서 매번 잡기를 기대하지 않고 여기서 막는다.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
let failed = 0;

function fail(rule: string, file: string, detail: string) {
  failed++;
  console.log(`  FAIL  [${rule}] ${relative(root, file).split(sep).join('/')} — ${detail}`);
}

async function walk(dir: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, exts)));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

const posix = (f: string) => f.split(sep).join('/');

// ── 1. 대외 웹사이트는 공개 데이터 계층만 쓴다 ─────────────────────────────
console.log('\n[1] 대외 웹사이트 → 공개 데이터만');
const portalFiles = await walk(join(root, 'apps/portal/src'), ['.ts', '.tsx']);
const ALLOWED_PORTAL = [
  /^\./, /^@\//, /^next(\/|$)/, /^react(\/|$)/,
  /^@vsp\/public-data$/, /^@vsp\/web-shared\//,
];
for (const f of portalFiles) {
  const src = await readFile(f, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec.endsWith('.css')) continue;
    if (!ALLOWED_PORTAL.some((re) => re.test(spec))) {
      fail('portal-import', f, `'${spec}' — 대외 웹사이트는 @vsp/public-data 와 @vsp/web-shared 만 쓴다`);
    }
  }
  if (/^\s*['"]use server['"]/m.test(src)) {
    fail('portal-no-write', f, "서버 액션이 있다 — 대외 웹사이트에는 쓰기 경로가 없어야 한다");
  }
}
console.log(`  검사한 파일 ${portalFiles.length}개`);

// ── 2. 공개 데이터 계층은 pub 스키마만 조회한다 ────────────────────────────
console.log('\n[2] 공개 데이터 계층 → pub 스키마만');
const pubFiles = await walk(join(root, 'packages/public-data/src'), ['.ts']);
for (const f of pubFiles) {
  const src = await readFile(f, 'utf8');
  // SQL 은 템플릿 문자열 안에 있다. 그 안에서 원본 스키마 이름을 찾는다.
  for (const m of src.matchAll(/`([^`]*)`/g)) {
    const hit = m[1].match(/\b(core|sport|grant_mgmt|content|pub_src)\.[a-z_]+/);
    if (hit) fail('pub-only', f, `원본 스키마 조회: ${hit[0]}`);
  }
}
console.log(`  검사한 파일 ${pubFiles.length}개`);

// ── 3. 업무·회원 화면은 화면마다 권한을 확인한다 ──────────────────────────
console.log('\n[3] 업무·회원 화면 → 화면마다 권한 확인');
const platformApp = join(root, 'apps/platform/src/app');
const platformFiles = await walk(platformApp, ['.ts', '.tsx']);
let pageCount = 0;
for (const f of platformFiles) {
  const p = posix(relative(platformApp, f));
  if (!p.endsWith('/page.tsx')) continue;
  const src = await readFile(f, 'utf8');
  if (p.startsWith('[locale]/admin/')) {
    pageCount++;
    if (!src.includes('requireWorkspace(')) fail('work-page', f, 'requireWorkspace() 호출이 없다');
  } else if (p.startsWith('[locale]/my/')) {
    pageCount++;
    if (!src.includes('requireMember(') && !src.includes('requireWorkspace(')) {
      fail('member-page', f, 'requireMember() 호출이 없다');
    }
  }
}
console.log(`  검사한 화면 ${pageCount}개`);

// ── 4. 서버 액션은 함수마다 권한을 확인한다 ───────────────────────────────
console.log('\n[4] 서버 액션 → 함수마다 권한 확인');
// 로그인 전 단계라 권한 확인이 있을 수 없는 액션
const PRE_AUTH = new Set(['requestOtp', 'verifyOtp', 'signOut']);
const AUTH_CALL = /(workUserOrNull|currentUser|requireWorkspace|requireMember)\(/;
let actionCount = 0;
for (const f of platformFiles) {
  const src = await readFile(f, 'utf8');
  if (!/^\s*['"]use server['"]/m.test(src)) continue;
  const starts = [...src.matchAll(/^export async function (\w+)\(/gm)];
  starts.forEach((m, i) => {
    actionCount++;
    const body = src.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : src.length);
    if (PRE_AUTH.has(m[1])) return;
    if (!AUTH_CALL.test(body)) fail('action-auth', f, `${m[1]}() 에 권한 확인이 없다`);
  });
}
console.log(`  검사한 액션 ${actionCount}개`);

// ── 5. 라우트 핸들러도 마찬가지 ─────────────────────────────────────────
console.log('\n[5] 업무 플랫폼 API → 권한 확인');
let routeCount = 0;
// 헬스체크는 인증 없이(로드밸런서용) 두되, 그 대가로 업무 스키마를 조회하지 않아야 한다.
const PUBLIC_ROUTES = new Set(['api/health/route.ts']);
for (const f of platformFiles) {
  const rel = posix(relative(platformApp, f));
  if (!rel.endsWith('/route.ts')) continue;
  routeCount++;
  const src = await readFile(f, 'utf8');
  if (PUBLIC_ROUTES.has(rel)) {
    for (const m of src.matchAll(/`([^`]*)`/g)) {
      const hit = m[1].match(/\b(core|sport|grant_mgmt|content)\.[a-z_]+/);
      if (hit) fail('health-route', f, `인증 면제 헬스체크가 업무 데이터를 조회한다: ${hit[0]}`);
    }
    continue;
  }
  if (!AUTH_CALL.test(src)) fail('route-auth', f, '권한 확인이 없다');
}
console.log(`  검사한 라우트 ${routeCount}개`);

console.log(failed === 0 ? '\n구조 경계가 지켜지고 있다.\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
