/**
 * 구독 (MY팀 — 관심 종목·단체 팔로우).
 *
 * 회원이 종목·단체를 구독한다. 로그인한 본인만 자기 구독을 관리한다.
 * 구독자 수는 공개 집계(pub.subscriber_count)로 나가고, 후원 중개의 인기 지표가 된다.
 */
import { query, queryOne } from './db';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type SubTarget = 'SPORT' | 'ORG' | 'PERSON';

export interface SubscriptionRow {
  id: UUID;
  target_type: SubTarget;
  target_id: UUID;
  target_name: I18nText | null;
  created_at: string;
}

/** 구독 추가 (이미 있으면 조용히 넘어간다). 대상 존재 여부는 화면이 고른 목록에서 오므로 신뢰한다. */
export async function subscribe(personId: UUID, targetType: SubTarget, targetId: UUID): Promise<void> {
  await query(
    `INSERT INTO core.subscription (person_id, target_type, target_id)
     VALUES ($1, $2, $3) ON CONFLICT (person_id, target_type, target_id) DO NOTHING`,
    [personId, targetType, targetId]
  );
}

/** 구독 해지. 본인 것만 지운다. */
export async function unsubscribe(personId: UUID, targetType: SubTarget, targetId: UUID): Promise<void> {
  await query(
    `DELETE FROM core.subscription WHERE person_id = $1 AND target_type = $2 AND target_id = $3`,
    [personId, targetType, targetId]
  );
}

/** 내 구독 목록 (대상 이름을 함께 해석해서 준다). */
export async function listSubscriptions(personId: UUID): Promise<SubscriptionRow[]> {
  return query<SubscriptionRow>(
    `SELECT s.id, s.target_type, s.target_id, s.created_at::text,
            CASE s.target_type
              WHEN 'SPORT'  THEN sp.name_i18n
              WHEN 'ORG'    THEN o.name_i18n
              WHEN 'PERSON' THEN jsonb_build_object('vi', pe.full_name, 'latin', pe.name_latin)
            END AS target_name
       FROM core.subscription s
       LEFT JOIN sport.sport sp ON s.target_type = 'SPORT' AND sp.id = s.target_id
       LEFT JOIN core.organization o ON s.target_type = 'ORG' AND o.id = s.target_id
       LEFT JOIN core.person pe ON s.target_type = 'PERSON' AND pe.id = s.target_id
      WHERE s.person_id = $1
      ORDER BY s.created_at DESC`,
    [personId]
  );
}

/** 특정 대상을 구독 중인지 (버튼 토글 표시용). */
export async function isSubscribed(personId: UUID, targetType: SubTarget, targetId: UUID): Promise<boolean> {
  const r = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM core.subscription
      WHERE person_id = $1 AND target_type = $2 AND target_id = $3`,
    [personId, targetType, targetId]
  );
  return (r?.n ?? 0) > 0;
}
