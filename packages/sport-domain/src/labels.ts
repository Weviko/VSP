/**
 * 등록 유형 이름표 (순수 모듈 — DB 에 의존하지 않는다).
 * 업무 플랫폼과 대외 웹사이트가 함께 쓴다.
 */
import type { I18nText } from '@vsp/core-admin/i18n';

export const REG_TYPES = [
  'ATHLETE', 'COACH', 'REFEREE', 'MANAGER', 'OFFICIAL', 'CENTER_STAFF',
] as const;
export type RegType = (typeof REG_TYPES)[number];

export const REG_TYPE_LABELS: Record<RegType, I18nText> = {
  ATHLETE: { vi: 'Vận động viên', en: 'Athlete', ko: '선수' },
  COACH: { vi: 'Huấn luyện viên', en: 'Coach', ko: '지도자' },
  REFEREE: { vi: 'Trọng tài', en: 'Referee', ko: '심판' },
  MANAGER: { vi: 'Cán bộ quản lý VĐV', en: 'Athlete Manager', ko: '선수관리담당자' },
  OFFICIAL: { vi: 'Cán bộ liên đoàn', en: 'Official', ko: '임원·직원' },
  CENTER_STAFF: { vi: 'Cán bộ trung tâm', en: 'Center Staff', ko: '훈련센터 관계자' },
};
