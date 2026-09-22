/**
 * 데모 — 공정·윤리 신고 6건 (MCST 미팅용).
 *
 * demo(조직·선수)·demo:scenario(대회·선수) 위에 얹는다. 실제 워크플로 함수를 그대로 써서
 * 접수→선별→조사→결정→조치→종결의 전 상태를 심는다. 시연 포인트:
 *   · 종결·공개(publish) 1건 → 대외 pub.integrity_case 노출
 *   · SUSPENSION 조치 1건 → 그 선수의 등록이 SUSPENDED → checkEligibility 출전 자동 차단
 *   · 고정 접수번호 VSPDEMO01(Case B, 조사중) → 대외 진행조회 시연
 *
 * 멱등: 신고가 이미 있으면 건너뛴다(다시 심으려면 --force).
 * 대외 표기 규칙: MATCH_FIXING 은 '경기 부정'으로만, 베팅·토토·배당 용어 미사용.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage';

import { createHash } from 'node:crypto';
import {
  query, queryOne, closePool,
  fileReport, screenReport, assignReport, addReportAction, decideReport, recordMeasure, closeReport,
  type UUID,
} from '../packages/core-admin/src/index.ts';

const force = process.argv.includes('--force');

async function main() {
  const existing = await queryOne<{ n: string }>(`SELECT count(*)::text AS n FROM integrity.report`);
  if (Number(existing?.n ?? 0) > 0 && !force) {
    console.log('공정·윤리 신고 데모가 이미 있습니다. 다시 심으려면 --force.');
    await closePool();
    return;
  }
  if (force) await query(`DELETE FROM integrity.report`); // parties/actions/measures 는 CASCADE

  // 감사·담당자용 액터 — 데모 업무 담당자 1명
  const actorRow = await queryOne<{ person_id: UUID; org_id: UUID }>(
    `SELECT m.person_id, m.org_id FROM core.org_member m
      WHERE (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
      ORDER BY m.role_code LIMIT 1`
  );
  const actor = actorRow ? { personId: actorRow.person_id, orgId: actorRow.org_id } : {};

  // 정지 반영 대상 — 성인 승인 선수 + 그 종목
  const ath = await queryOne<{ person_id: UUID; sport_id: UUID; full_name: string }>(
    `SELECT r.person_id, r.sport_id, p.full_name
       FROM sport.registration r JOIN core.person p ON p.id = r.person_id
      WHERE r.reg_type = 'ATHLETE' AND r.status = 'APPROVED'
        AND p.birth_date <= CURRENT_DATE - INTERVAL '18 years'
      ORDER BY r.created_at LIMIT 1`
  );
  const sportId =
    ath?.sport_id ?? (await queryOne<{ id: UUID }>(`SELECT id FROM sport.sport ORDER BY sort_order LIMIT 1`))?.id ?? null;

  // Case A — 경기 부정: 종결·공개 + 정지 반영
  const a = await fileReport(
    { category: 'MATCH_FIXING', title: '리그 경기 부정 의혹 신고',
      detail: '특정 경기에서 이상 정황이 있었다는 제보.', isAnonymous: false,
      sportId, respondentName: '해당 구단 관계자' },
    actor
  );
  await screenReport(a.id, { severity: 'MED' }, actor);
  await assignReport(a.id, { orgId: actor.orgId ?? null, personId: actor.personId ?? null }, actor);
  await addReportAction(a.id, { action: 'INTERVIEW', note: '관련자 면담 실시.' }, actor);
  await decideReport(a.id, { summary: '경기 부정 사실 확인.' }, actor);
  if (ath) {
    await recordMeasure(
      a.id,
      { measureType: 'SUSPENSION', targetPersonId: ath.person_id, decisionNo: '2026-공정-001', startsOn: '2026-09-01', endsOn: '2027-08-31' },
      actor
    );
  }
  await closeReport(
    a.id,
    { publish: true, publicSummaryI18n: {
      vi: 'Xác nhận gian lận thi đấu; áp dụng đình chỉ tư cách.',
      ko: '경기 부정 사실 확인, 자격정지 조치 완료.',
      en: 'Match manipulation confirmed; suspension applied.' } },
    actor
  );

  // Case B — 폭력(익명): 조사중, 고정 접수번호 VSPDEMO01
  const b = await fileReport(
    { category: 'VIOLENCE', title: '지도자 폭력 신고', detail: '훈련 중 폭력이 있었다는 신고.', isAnonymous: true },
    {}
  );
  await screenReport(b.id, { severity: 'HIGH' }, actor);
  await assignReport(b.id, { orgId: actor.orgId ?? null, personId: actor.personId ?? null }, actor);
  const FIXED = 'VSPDEMO01';
  await query(`UPDATE integrity.report SET tracking_code_hash = $2 WHERE id = $1`, [
    b.id, createHash('sha256').update(FIXED).digest('hex'),
  ]);

  // Case C — 성비위(익명, 미성년): 접수
  await fileReport(
    { category: 'SEXUAL', title: '미성년 선수 관련 신고', isAnonymous: true, isMinorInvolved: true },
    {}
  );

  // Case D — 비리: 종결(비공개) + 경고
  const d = await fileReport({ category: 'CORRUPTION', title: '보조금 유용 의혹', isAnonymous: false }, actor);
  await screenReport(d.id, { severity: 'LOW' }, actor);
  await assignReport(d.id, { orgId: actor.orgId ?? null, personId: actor.personId ?? null }, actor);
  await decideReport(d.id, { summary: '경미한 절차 위반 확인.' }, actor);
  await recordMeasure(d.id, { measureType: 'WARNING' }, actor);
  await closeReport(d.id, { publish: false }, actor);

  // Case E — 기타: 각하
  const e = await fileReport({ category: 'OTHER', title: '단순 민원', isAnonymous: false }, actor);
  await screenReport(e.id, { dismiss: true, reason: '신고 요건 미충족.' }, actor);

  // Case F — 폭력: 신규 접수
  await fileReport({ category: 'VIOLENCE', title: '경기장 폭언 신고', isAnonymous: false }, actor);

  console.log('공정·윤리 신고 데모 6건 생성.');
  console.log('  · 대외 진행조회 데모 접수번호: VSPDEMO01 (Case B, 조사중)');
  console.log('  · 종결·공개(pub.integrity_case) 1건, 종결·비공개 1건, 각하 1건, 접수 2건');
  if (ath) console.log(`  · 정지 반영: ${ath.full_name} 의 해당 종목 등록 → SUSPENDED (checkEligibility 자동 차단)`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
