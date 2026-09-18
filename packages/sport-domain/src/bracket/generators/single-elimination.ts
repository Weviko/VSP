import type {
  BracketGenerator, BracketInput, BracketResult, BracketEntrant, GeneratedMatch,
} from '../types';

/**
 * 싱글 엘리미네이션(토너먼트).
 *
 * 참가자 수가 2의 거듭제곱이 아니면 상위 시드에게 부전승(bye)을 준다.
 * 표준 시드 배치를 써서 1번과 2번 시드가 결승 전에 만나지 않게 한다.
 *
 * 1라운드 이후의 경기도 미리 생성한다(참가자는 미정 상태).
 * 대회 담당자가 대진표를 인쇄해서 벽에 붙여야 하기 때문에 빈 대진칸이 필요하다.
 */

/** 대진의 한 자리. 실제 참가자이거나, 이전 경기 승자 대기이거나, 빈자리(부전승 상대). */
type Slot =
  | { kind: 'entrant'; entrant: BracketEntrant }
  | { kind: 'winner'; fromMatchNo: string }
  | { kind: 'empty' };

export class SingleEliminationGenerator implements BracketGenerator {
  readonly format = 'TOURNAMENT' as const;

  describe(): string {
    return 'Single elimination. Byes go to top seeds.';
  }

  generate(input: BracketInput): BracketResult {
    const notes: string[] = [];
    const entrants = seedOrder(input.entrants);
    const n = entrants.length;
    if (n < 2) return { format: this.format, matches: [], notes: ['not enough entrants'] };

    const size = 2 ** Math.ceil(Math.log2(n));
    const byes = size - n;
    if (byes > 0) notes.push(`${byes} bye(s) assigned to top seeds`);

    // 표준 시드 위치에 배치. 자리가 모자라면 빈자리(= 상대가 부전승)
    let slots: Slot[] = seedPositions(size).map((seedIdx) =>
      seedIdx < n
        ? ({ kind: 'entrant', entrant: entrants[seedIdx] } as Slot)
        : ({ kind: 'empty' } as Slot)
    );

    const byNo = new Map<string, GeneratedMatch>();
    let round = 1;

    while (slots.length > 1) {
      const roundName = roundLabel(slots.length);
      const next: Slot[] = [];
      let seq = 1;

      for (let i = 0; i < slots.length; i += 2) {
        const a = slots[i];
        const b = slots[i + 1];

        // 둘 다 비었으면 이 자리는 계속 빈자리로 올라간다
        if (a.kind === 'empty' && b.kind === 'empty') {
          next.push({ kind: 'empty' });
          continue;
        }
        // 한쪽만 비었으면 부전승 — 경기를 만들지 않고 그대로 진출
        if (b.kind === 'empty') {
          next.push(a);
          continue;
        }
        if (a.kind === 'empty') {
          next.push(b);
          continue;
        }

        const matchNo = `${roundName}-${seq++}`;
        byNo.set(matchNo, {
          roundName,
          matchNo,
          participants: [
            { entryId: a.kind === 'entrant' ? a.entrant.entryId : null, side: 'A' },
            { entryId: b.kind === 'entrant' ? b.entrant.entryId : null, side: 'B' },
          ],
          advancesTo: null,
        });

        // 이전 경기 승자가 이 경기로 올라온다는 연결을 기록
        for (const prev of [a, b]) {
          if (prev.kind === 'winner') {
            const src = byNo.get(prev.fromMatchNo);
            if (src) src.advancesTo = matchNo;
          }
        }

        next.push({ kind: 'winner', fromMatchNo: matchNo });
      }

      slots = next;
      round += 1;
      if (round > 12) break; // 방어: 비정상 입력으로 인한 무한 루프 차단
    }

    return { format: this.format, matches: [...byNo.values()], notes };
  }
}

/** 시드 번호가 있으면 그 순서대로, 없으면 무작위 */
function seedOrder(entrants: BracketEntrant[]): BracketEntrant[] {
  const seeded = entrants.filter((e) => e.seed != null).sort((a, b) => a.seed! - b.seed!);
  const unseeded = entrants.filter((e) => e.seed == null);
  for (let i = unseeded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
  }
  return [...seeded, ...unseeded];
}

/**
 * 표준 토너먼트 시드 위치.
 * size=8 이면 [0,7,3,4,1,6,2,5] — 1번 시드와 2번 시드는 결승에서만 만난다.
 */
function seedPositions(size: number): number[] {
  let positions = [0];
  while (positions.length < size) {
    const roundSize = positions.length * 2;
    const next: number[] = [];
    for (const p of positions) next.push(p, roundSize - 1 - p);
    positions = next;
  }
  return positions;
}

function roundLabel(slotCount: number): string {
  if (slotCount === 2) return 'FINAL';
  if (slotCount === 4) return 'SEMI';
  if (slotCount === 8) return 'QUARTER';
  return `R${slotCount}`;
}
