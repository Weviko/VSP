import type { BracketGenerator, BracketInput, BracketResult, GeneratedMatch } from '../types';

/**
 * 리그(라운드로빈).
 *
 * 원형 회전법(circle method)으로 모든 참가자가 한 번씩 맞붙는 일정을 만든다.
 * 홀수일 때는 가상의 부전 상대를 넣어 짝수로 맞춘 뒤 해당 경기를 제외한다.
 *
 * options.doubleRound = true 이면 홈/어웨이 2회전을 만든다.
 */
export class RoundRobinGenerator implements BracketGenerator {
  readonly format = 'LEAGUE' as const;

  describe(): string {
    return 'Round robin. Every entrant plays each other once (or twice).';
  }

  generate(input: BracketInput): BracketResult {
    const notes: string[] = [];
    const ids = input.entrants.map((e) => e.entryId);
    if (ids.length < 2) return { format: this.format, matches: [], notes: ['not enough entrants'] };

    const doubleRound = Boolean(input.options?.doubleRound);

    // 홀수면 BYE 자리를 추가해 짝수로 만든다
    const roster: Array<string | null> = [...ids];
    if (roster.length % 2 === 1) {
      roster.push(null);
      notes.push('odd number of entrants: one rests each round');
    }

    const half = roster.length / 2;
    const rounds = roster.length - 1;
    const matches: GeneratedMatch[] = [];

    // 첫 번째 자리를 고정하고 나머지를 회전시킨다
    let rotating = roster.slice(1);

    for (let r = 0; r < rounds; r++) {
      const lineup = [roster[0], ...rotating];
      let matchIdx = 1;

      for (let i = 0; i < half; i++) {
        const home = lineup[i];
        const away = lineup[lineup.length - 1 - i];
        if (home === null || away === null) continue; // 부전 라운드

        matches.push({
          roundName: `R${r + 1}`,
          matchNo: `R${r + 1}-${matchIdx++}`,
          participants: [
            { entryId: home, side: 'HOME' },
            { entryId: away, side: 'AWAY' },
          ],
        });
      }
      rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
    }

    if (doubleRound) {
      const second = matches.map((m, i) => ({
        roundName: `R${rounds + Number(m.roundName.slice(1))}`,
        matchNo: `R${rounds + Number(m.roundName.slice(1))}-${i + 1}`,
        participants: [
          { entryId: m.participants[1].entryId, side: 'HOME' },
          { entryId: m.participants[0].entryId, side: 'AWAY' },
        ],
      }));
      matches.push(...second);
      notes.push('double round (home and away) generated');
    }

    return { format: this.format, matches, notes };
  }
}
