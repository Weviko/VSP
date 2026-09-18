/**
 * 대진 생성 검증.
 * 대진에 버그가 있으면 대회 당일에 사고가 난다. 실제로 돌려서 확인한다.
 */
import { generateBracket, listAvailableFormats, UnsupportedFormatError } from '../packages/sport-domain/src/bracket/index.ts';
import type { BracketEntrant } from '../packages/sport-domain/src/bracket/types.ts';

function entrants(n: number, seeded = false): BracketEntrant[] {
  return Array.from({ length: n }, (_, i) => ({
    entryId: `e${i + 1}`,
    label: `VĐV ${i + 1}`,
    seed: seeded ? i + 1 : null,
  }));
}

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log('\nAvailable formats:');
for (const f of listAvailableFormats()) console.log(`  - ${f.format}: ${f.description}`);

console.log('\nTOURNAMENT (single elimination)');
for (const n of [2, 3, 4, 5, 8, 9, 16, 32]) {
  const r = generateBracket('TOURNAMENT', { entrants: entrants(n, true) });
  // 싱글 엘리미네이션은 우승자 1명을 남기므로 실제 경기 수는 n-1 이어야 한다
  check(`n=${n} match count = ${n - 1}`, r.matches.length === n - 1, `got ${r.matches.length}`);

  // 참가자는 대진 전체에서 정확히 한 번만 배치되어야 한다 (첫 등장 기준)
  const placed = r.matches.flatMap((m) => m.participants.map((p) => p.entryId)).filter(Boolean);
  check(`n=${n} each entrant placed once`, new Set(placed).size === placed.length,
    `${placed.length} placements, ${new Set(placed).size} unique`);

  // 결승은 정확히 하나여야 한다
  const finals = r.matches.filter((m) => m.roundName === 'FINAL');
  check(`n=${n} exactly one final`, finals.length === 1, `got ${finals.length}`);

  // 결승을 제외한 모든 경기는 진출처가 있어야 한다
  const dangling = r.matches.filter((m) => m.roundName !== 'FINAL' && !m.advancesTo);
  check(`n=${n} every non-final advances`, dangling.length === 0,
    dangling.map((m) => m.matchNo).join(','));
}

// 8명 시드 대진에서 1번과 2번 시드가 1라운드에 만나면 안 된다
{
  const r = generateBracket('TOURNAMENT', { entrants: entrants(8, true) });
  const r1 = r.matches.filter((m) => m.roundName === 'QUARTER');
  const clash = r1.some((m) => {
    const s = m.participants.map((p) => p.entryId);
    return s.includes('e1') && s.includes('e2');
  });
  check('seeds 1 and 2 not paired in round 1', !clash);
}

console.log('\nLEAGUE (round robin)');
for (const n of [2, 3, 4, 5, 6, 10]) {
  const r = generateBracket('LEAGUE', { entrants: entrants(n) });
  const expected = (n * (n - 1)) / 2;
  check(`n=${n} match count = ${expected}`, r.matches.length === expected, `got ${r.matches.length}`);

  // 모든 조합이 정확히 한 번씩 나와야 한다
  const pairs = new Set(
    r.matches.map((m) => m.participants.map((p) => p.entryId).sort().join('|'))
  );
  check(`n=${n} all pairs unique`, pairs.size === expected);

  // 한 라운드에서 같은 참가자가 두 경기를 뛰면 안 된다
  const byRound = new Map<string, string[]>();
  for (const m of r.matches) {
    const arr = byRound.get(m.roundName) ?? [];
    arr.push(...m.participants.map((p) => p.entryId as string));
    byRound.set(m.roundName, arr);
  }
  const noClash = [...byRound.values()].every((ids) => new Set(ids).size === ids.length);
  check(`n=${n} no double-booking within a round`, noClash);
}

{
  const r = generateBracket('LEAGUE', { entrants: entrants(4), options: { doubleRound: true } });
  check('double round = 12 matches for n=4', r.matches.length === 12, `got ${r.matches.length}`);
}

console.log('\nUnimplemented format behaves predictably');
try {
  generateBracket('GROUP_KNOCKOUT', { entrants: entrants(8) });
  check('throws UnsupportedFormatError', false);
} catch (e) {
  check('throws UnsupportedFormatError', e instanceof UnsupportedFormatError);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
