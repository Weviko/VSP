/**
 * 결재 엔진의 순수 타입.
 * 클라이언트 컴포넌트가 DB 모듈을 끌어오지 않도록 분리한다.
 */
export type ActionType = 'APPROVE' | 'REJECT' | 'RETURN' | 'DELEGATE' | 'COMMENT';

export type ApproverType =
  | 'ROLE_IN_ORG'
  | 'ROLE_IN_PARENT_ORG'
  | 'SPECIFIC_ORG'
  | 'SUBMITTER_ORG_HEAD';
