/**
 * i18n 회귀 가드 (DB 불필요, 파일만 스캔).
 *
 * 라이브에서 status.OPEN 이 원문으로 노출된 사고를 계기로 만든다.
 * 정적 t('키')는 grep 으로 잡히지만, t(`status.${x}`) 같은 동적 키는 안 잡혀 누락이 새어나간다.
 * 여기서 세 가지를 강제한다:
 *   1) 세 언어(vi/en/ko) 키 집합이 완전히 같다 (+ 빈 값 없음)
 *   2) 코드의 정적 t('literal') 키가 모두 존재한다
 *   3) 동적 키 계약(status·news.source·score·poll.set·nav)의 전 값이 존재한다
 * 새로운 status 를 t(`status.${}`) 로 렌더하면 아래 계약 목록과 i18n 키를 함께 갱신해야 한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

const MSG_DIR = 'packages/web-shared/src/i18n/messages';
const LOCALES = ['vi', 'en', 'ko'] as const;

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

const flat: Record<string, Record<string, string>> = {};
for (const loc of LOCALES) {
  flat[loc] = flatten(JSON.parse(readFileSync(join(MSG_DIR, `${loc}.json`), 'utf8')));
}
const koKeys = new Set(Object.keys(flat.ko));

console.log('\n[1] 세 언어 키 정합성');
const all = new Set<string>(LOCALES.flatMap((l) => Object.keys(flat[l])));
for (const loc of LOCALES) {
  const miss = [...all].filter((k) => !(k in flat[loc]));
  check(`${loc}: 누락 키 없음`, miss.length === 0, miss.slice(0, 8).join(', '));
  const empty = Object.entries(flat[loc]).filter(([, v]) => v === '' || v === 'undefined').map(([k]) => k);
  check(`${loc}: 빈 값 없음`, empty.length === 0, empty.slice(0, 8).join(', '));
}
check('총 키 수 동일', new Set(LOCALES.map((l) => Object.keys(flat[l]).length)).size === 1,
  LOCALES.map((l) => `${l}=${Object.keys(flat[l]).length}`).join(' '));

console.log('\n[2] 정적 t(\'키\') 참조가 모두 존재');
const SRC_DIRS = ['apps/platform/src', 'apps/portal/src', 'packages/web-shared/src'];
const STATIC_RE = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]\s*\)/g;
const refs = new Map<string, string>();
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) {
      const txt = readFileSync(p, 'utf8');
      for (const m of txt.matchAll(STATIC_RE)) if (!refs.has(m[1])) refs.set(m[1], p);
    }
  }
}
for (const d of SRC_DIRS) walk(d);
const missingStatic = [...refs].filter(([k]) => !koKeys.has(k));
check(`정적 키 ${refs.size}개 전부 존재`, missingStatic.length === 0,
  missingStatic.map(([k, f]) => `${k} <- ${f}`).slice(0, 10).join(' | '));

console.log('\n[3] 동적 키 계약 (t(`prefix.${enum}`))');
// t(`status.${...}`) 로 렌더되는 도메인들의 enum 합집합 — 새 status 렌더 시 여기 추가.
const STATUS_RENDERED = [
  // 조직/기자자격
  'ACTIVE', 'PENDING', 'SUSPENDED', 'CLOSED', 'EXPIRED',
  // 등록/신청/대회승인
  'DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'WITHDRAWN',
  // 후원 제안
  'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED',
  // AI 작업
  'EXTRACTED', 'APPLIED', 'FAILED',
  // 투표/기사/영상/광고
  'OPEN', 'REVIEW', 'PUBLISHED', 'HIDDEN', 'ENDED',
  // 대회/경기 상태
  'PLANNED', 'ONGOING', 'FINISHED', 'CANCELLED', 'SCHEDULED', 'LIVE',
  // 결제
  'PAID', 'REFUNDED',
  // 알림 큐
  'QUEUED', 'SKIPPED',
];
const CONTRACT: Array<[string, string[]]> = [
  ['status', STATUS_RENDERED],
  ['news.source', ['AUTO', 'PRESS', 'ORG', 'PARTNER']],
  ['score', ['scheduled', 'ongoing', 'finished', 'cheer', 'live', 'record']],
  ['poll', ['setDRAFT', 'setOPEN', 'setCLOSED']],
  // 공정·윤리 신고: 유형·상태·조치유형을 t(`integrity.cat|st|mt.${x}`) 로 렌더
  ['integrity.cat', ['VIOLENCE', 'SEXUAL', 'MATCH_FIXING', 'CORRUPTION', 'OTHER']],
  ['integrity.st', ['RECEIVED', 'SCREENING', 'INVESTIGATING', 'DECIDED', 'CLOSED', 'DISMISSED']],
  ['integrity.mt', ['WARNING', 'SUSPENSION', 'BAN', 'EDU_ORDER', 'REFERRAL']],
  // 국가대표: 연령급·성별·소집유형·승인/소집상태·역할·명단상태·선발근거·자격사유를 t(`nteam.*.${x}`) 로 렌더
  ['nteam.age', ['SENIOR', 'U23', 'U20', 'YOUTH']],
  ['nteam.gender', ['M', 'F', 'MIXED']],
  ['nteam.ctype', ['SELECTION', 'CAMP', 'COMPETITION_ENTRY']],
  ['nteam.astatus', ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']],
  ['nteam.cstatus', ['PLANNED', 'OPEN', 'FINALIZED', 'CANCELLED']],
  ['nteam.role', ['ATHLETE', 'COACH', 'MANAGER', 'MEDICAL', 'RESERVE']],
  ['nteam.mstatus', ['NOMINATED', 'SELECTED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN', 'REPLACED']],
  ['nteam.source', ['TRIAL', 'RANKING', 'DISCRETIONARY']],
  ['nteam.reason', ['NOT_REGISTERED', 'NOT_APPROVED', 'SUSPENDED', 'ANTIDOPING_EDUCATION_MISSING', 'SAFEGUARDING_EDUCATION_MISSING', 'UNPAID_FEE']],
  // 업무 좌측 메뉴는 t(`nav.${key}`) 로 렌더된다
  ['nav', ['dashboard', 'ingest', 'approvals', 'organizations', 'people', 'registrations', 'seasons', 'import',
    'certificates', 'events', 'payments', 'grants', 'sponsors', 'content', 'polls', 'ads', 'users', 'integrity',
    'nationalTeams', 'documents', 'notifications', 'audit', 'reports', 'settings']],
];
for (const [prefix, values] of CONTRACT) {
  const miss = values.filter((v) => !koKeys.has(`${prefix}.${v}`));
  check(`${prefix}.* 계약 ${values.length}개 전부 존재`, miss.length === 0,
    miss.map((v) => `${prefix}.${v}`).join(', '));
}

console.log(failed === 0 ? '\ni18n: 세 언어 정합·정적·동적 키 모두 존재.\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
