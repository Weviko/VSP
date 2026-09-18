/**
 * 대진 생성기 계약(contract).
 *
 * 종목마다 경기 방식이 완전히 다르다. 지금은 토너먼트와 리그만 구현하지만,
 * 조별예선+결선, 기록경기(레인 배정), 채점경기(연기 순서) 등이 나중에 필요하다.
 * 그때 기존 코드를 수정하지 않고 파일 하나를 추가해 등록만 하면 되도록 인터페이스를 고정한다.
 */

export type MatchFormat =
  | 'TOURNAMENT'       // 싱글 엘리미네이션
  | 'DOUBLE_ELIM'      // 더블 엘리미네이션
  | 'LEAGUE'           // 리그(라운드로빈)
  | 'GROUP_KNOCKOUT'   // 조별예선 + 토너먼트
  | 'MEASURED'         // 기록경기 (수영·육상: 레인/조 편성)
  | 'SCORED';          // 채점경기 (체조·다이빙: 연기 순서)

/** 대진에 들어갈 참가자 한 명 또는 한 팀 */
export interface BracketEntrant {
  entryId: string;
  /** 표시용 이름 (선수명 또는 팀명) */
  label: string;
  /** 시드 번호. 없으면 무작위 배정 */
  seed?: number | null;
  /** 같은 소속끼리 초반에 만나지 않게 하는 데 사용 */
  orgId?: string | null;
}

export interface BracketInput {
  entrants: BracketEntrant[];
  /** 종목·부문별 세부 옵션 (생성기마다 해석이 다르다) */
  options?: Record<string, unknown>;
}

/** 생성 결과 — sport.match / sport.match_participant 로 저장된다 */
export interface GeneratedMatch {
  roundName: string;
  matchNo: string;
  /** 참가자 슬롯. null이면 부전승(bye) 또는 이전 경기 승자 대기 */
  participants: Array<{ entryId: string | null; side: string; laneNo?: number }>;
  /** 이 경기의 승자가 진출할 다음 경기 번호 (토너먼트에서 사용) */
  advancesTo?: string | null;
}

export interface BracketResult {
  format: MatchFormat;
  matches: GeneratedMatch[];
  /** 생성 과정에서 알아둘 점 (부전승 수 등) */
  notes: string[];
}

export interface BracketGenerator {
  format: MatchFormat;
  /** 사람이 읽을 설명 (관리자 화면의 방식 선택지에 표시) */
  describe(): string;
  generate(input: BracketInput): BracketResult;
}
