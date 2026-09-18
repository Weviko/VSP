/**
 * 대진 생성기 레지스트리.
 *
 * 새 경기 방식을 추가하는 절차:
 *   1) generators/ 에 파일 하나를 만들어 BracketGenerator 를 구현한다
 *   2) index.ts 에서 register(new MyGenerator()) 한 줄을 추가한다
 * 기존 파일은 수정하지 않는다.
 */
import type { BracketGenerator, BracketInput, BracketResult, MatchFormat } from './types';

const registry = new Map<MatchFormat, BracketGenerator>();

export function register(generator: BracketGenerator): void {
  registry.set(generator.format, generator);
}

export function getGenerator(format: MatchFormat): BracketGenerator | null {
  return registry.get(format) ?? null;
}

/** 관리자 화면에서 "이 대회는 어떤 방식으로?" 선택지를 만들 때 사용 */
export function listAvailableFormats(): Array<{ format: MatchFormat; description: string }> {
  return [...registry.values()].map((g) => ({ format: g.format, description: g.describe() }));
}

export class UnsupportedFormatError extends Error {
  constructor(public format: MatchFormat) {
    super(`bracket format not implemented yet: ${format}`);
  }
}

/**
 * 대진 생성.
 * 아직 구현되지 않은 방식이면 명확한 에러를 던진다.
 * 화면에서는 이 에러를 잡아 "이 방식은 수동 입력으로 진행하세요"로 안내한다.
 */
export function generateBracket(format: MatchFormat, input: BracketInput): BracketResult {
  const gen = getGenerator(format);
  if (!gen) throw new UnsupportedFormatError(format);
  return gen.generate(input);
}
