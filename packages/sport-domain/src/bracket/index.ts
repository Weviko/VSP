/**
 * 대진 생성 진입점.
 *
 * 새 경기 방식을 추가하려면:
 *   1) generators/ 에 BracketGenerator 구현 파일을 만든다
 *   2) 아래에 import 와 register() 를 한 줄씩 추가한다
 * 다른 파일은 건드리지 않는다.
 */
import { register } from './registry';
import { SingleEliminationGenerator } from './generators/single-elimination';
import { RoundRobinGenerator } from './generators/round-robin';

register(new SingleEliminationGenerator());
register(new RoundRobinGenerator());

// 나중에 추가될 것들 (파일 생성 + 아래 두 줄만 추가하면 동작한다)
// register(new GroupKnockoutGenerator());   // 조별예선 + 결선 토너먼트
// register(new MeasuredEventGenerator());   // 기록경기: 레인/조 편성
// register(new ScoredEventGenerator());     // 채점경기: 연기 순서
// register(new DoubleEliminationGenerator());

export * from './types';
export * from './registry';
