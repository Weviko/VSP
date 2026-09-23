/**
 * 도핑방지 (antidoping).
 *
 * 검사 → A/B 분석 → AAF 판정 → 제재(위반이력), 그리고 도핑방지 교육 이수.
 * 두 교차모듈 훅:
 *   · 제재(SUSPENSION) → sport.registration.status='SUSPENDED' → checkEligibility 출전 차단
 *     (공정·윤리 신고 recordMeasure 와 같은 '출전차단' 훅을 공유).
 *   · 교육 이수 → sport.registration.eligibility.antidoping 채움 → requireEducation 게이트 충족.
 * 시료코드는 해시만 저장한다(재식별 방지).
 */
import { createHash } from 'node:crypto';
import { query, queryOne, tx, writeAudit, issueCertificate, type UUID, type I18nText } from '@vsp/core-admin';

export type TestType = 'IN_COMPETITION' | 'OUT_OF_COMPETITION';
export type SampleType = 'URINE' | 'BLOOD';
export type ABResult = 'NEG' | 'POS';
export type TestOutcome = 'PENDING' | 'NEGATIVE' | 'AAF';
export type SanctionType = 'SUSPENSION' | 'WARNING' | 'DQ';
export type SanctionStatus = 'ACTIVE' | 'SERVED' | 'APPEALED' | 'ANNULLED';

type Actor = { personId?: UUID | null; orgId?: UUID | null };
const hashSample = (code: string) => createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

// ── 검사 ──────────────────────────────────────────────────────────────────

export interface TestRow {
  id: UUID; person_id: UUID; full_name: string; sport_id: UUID | null; sport_name: I18nText | null;
  test_type: TestType; sample_type: SampleType; collected_at: string;
  a_result: ABResult | null; b_result: ABResult | null; outcome: TestOutcome;
}

export interface RecordTestInput {
  personId: UUID; sportId?: UUID | null; eventId?: UUID | null;
  testType?: TestType; sampleType?: SampleType; sampleCode?: string | null; collectorOrgId?: UUID | null;
}
export async function recordTest(input: RecordTestInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO antidoping.test
         (person_id, sport_id, event_id, test_type, sample_type, sample_code_hash, collector_org_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.personId, input.sportId ?? null, input.eventId ?? null,
       input.testType ?? 'OUT_OF_COMPETITION', input.sampleType ?? 'URINE',
       input.sampleCode ? hashSample(input.sampleCode) : null, input.collectorOrgId ?? null]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'test', entityId: row.id,
        action: 'INSERT', after: { person: input.personId, type: input.testType ?? 'OUT_OF_COMPETITION' } },
      client
    );
    return row.id;
  });
}

function judge(a: ABResult | null, b: ABResult | null): TestOutcome {
  if (a === 'POS' && (b === 'POS' || b == null)) return 'AAF';
  if (a === 'NEG' || b === 'NEG') return 'NEGATIVE';
  return 'PENDING';
}

/** A/B 분석결과 입력 후 결과(NEGATIVE/AAF/PENDING) 자동 판정. */
export async function recordLabResult(
  testId: UUID, input: { aResult?: ABResult | null; bResult?: ABResult | null }, actor: Actor = {}
): Promise<TestOutcome> {
  return tx(async (client) => {
    const cur = (await client.query<{ a_result: ABResult | null; b_result: ABResult | null }>(
      `SELECT a_result, b_result FROM antidoping.test WHERE id=$1`, [testId]
    )).rows[0];
    const a = input.aResult !== undefined ? input.aResult : cur?.a_result ?? null;
    const b = input.bResult !== undefined ? input.bResult : cur?.b_result ?? null;
    const outcome = judge(a, b);
    await client.query(
      `UPDATE antidoping.test SET a_result=$2, b_result=$3, outcome=$4 WHERE id=$1`,
      [testId, a, b, outcome]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'test', entityId: testId,
        action: 'LAB_RESULT', after: { a, b, outcome } },
      client
    );
    return outcome;
  });
}

export async function listTests(filter: { outcome?: TestOutcome | null; personId?: UUID | null } = {}): Promise<TestRow[]> {
  return query<TestRow>(
    `SELECT t.id, t.person_id, p.full_name, t.sport_id, s.name_i18n AS sport_name,
            t.test_type, t.sample_type, t.collected_at::text AS collected_at,
            t.a_result, t.b_result, t.outcome
       FROM antidoping.test t
       JOIN core.person p ON p.id = t.person_id
       LEFT JOIN sport.sport s ON s.id = t.sport_id
      WHERE ($1::text IS NULL OR t.outcome = $1)
        AND ($2::uuid IS NULL OR t.person_id = $2)
      ORDER BY t.collected_at DESC`,
    [filter.outcome ?? null, filter.personId ?? null]
  );
}

// ── 제재 ──────────────────────────────────────────────────────────────────

export interface SanctionRow {
  id: UUID; person_id: UUID; full_name: string; sanction_type: SanctionType; adrv_article: string | null;
  starts_on: string | null; ends_on: string | null; decision_no: string | null;
  is_public: boolean; status: SanctionStatus; reflected_to_registration: boolean;
}

export interface DecideSanctionInput {
  personId: UUID; testId?: UUID | null; sanctionType?: SanctionType; adrvArticle?: string | null;
  startsOn?: string | null; endsOn?: string | null; decisionNo?: string | null; isPublic?: boolean; sportId?: UUID | null;
}
/** 제재 확정. SUSPENSION 이면 그 선수의 승인 등록을 SUSPENDED 로 바꿔 출전을 자동 차단한다. */
export async function decideSanction(input: DecideSanctionInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const stype = input.sanctionType ?? 'SUSPENSION';
    let reflected = false;
    let registrationId: UUID | null = null;
    if (stype === 'SUSPENSION') {
      const res = await client.query<{ id: UUID }>(
        `UPDATE sport.registration SET status='SUSPENDED', updated_at=now()
          WHERE person_id=$1 AND reg_type='ATHLETE' AND status='APPROVED'
            AND ($2::uuid IS NULL OR sport_id=$2)
        RETURNING id`,
        [input.personId, input.sportId ?? null]
      );
      reflected = res.rows.length > 0;
      registrationId = res.rows[0]?.id ?? null;
    }
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO antidoping.sanction
         (person_id, registration_id, test_id, adrv_article, sanction_type, starts_on, ends_on,
          decision_no, is_public, reflected_to_registration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [input.personId, registrationId, input.testId ?? null, input.adrvArticle ?? null, stype,
       input.startsOn ?? null, input.endsOn ?? null, input.decisionNo ?? null, input.isPublic ?? false, reflected]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'sanction', entityId: row.id,
        action: 'DECIDE_SANCTION', after: { person: input.personId, type: stype, reflected, public: input.isPublic ?? false } },
      client
    );
    return row.id;
  });
}

/** 제재 해제/만료 — status SERVED, 반영됐던 등록을 APPROVED 로 복원. */
export async function liftSanction(sanctionId: UUID, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    const sn = (await client.query<{ registration_id: UUID | null; reflected_to_registration: boolean }>(
      `SELECT registration_id, reflected_to_registration FROM antidoping.sanction WHERE id=$1`, [sanctionId]
    )).rows[0];
    if (sn?.reflected_to_registration && sn.registration_id) {
      await client.query(
        `UPDATE sport.registration SET status='APPROVED', updated_at=now()
          WHERE id=$1 AND status='SUSPENDED'`,
        [sn.registration_id]
      );
    }
    await client.query(`UPDATE antidoping.sanction SET status='SERVED' WHERE id=$1`, [sanctionId]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'sanction', entityId: sanctionId,
        action: 'LIFT_SANCTION', after: { status: 'SERVED' } },
      client
    );
  });
}

export async function listSanctions(filter: { status?: SanctionStatus | null } = {}): Promise<SanctionRow[]> {
  return query<SanctionRow>(
    `SELECT sn.id, sn.person_id, p.full_name, sn.sanction_type, sn.adrv_article,
            sn.starts_on::text AS starts_on, sn.ends_on::text AS ends_on, sn.decision_no,
            sn.is_public, sn.status, sn.reflected_to_registration
       FROM antidoping.sanction sn
       JOIN core.person p ON p.id = sn.person_id
      WHERE ($1::text IS NULL OR sn.status = $1)
      ORDER BY sn.created_at DESC`,
    [filter.status ?? null]
  );
}

// ── 교육 ──────────────────────────────────────────────────────────────────

export interface EducationCourseRow {
  id: UUID; code: string | null; name_i18n: I18nText; sport_id: UUID | null;
  validity_months: number; is_mandatory: boolean; status: string; record_count: number;
}
export async function listEducationCourses(): Promise<EducationCourseRow[]> {
  return query<EducationCourseRow>(
    `SELECT ec.id, ec.code, ec.name_i18n, ec.sport_id, ec.validity_months, ec.is_mandatory, ec.status,
            (SELECT count(*)::int FROM antidoping.education_record er WHERE er.course_id = ec.id) AS record_count
       FROM antidoping.education_course ec
      WHERE ec.status = 'ACTIVE'
      ORDER BY ec.created_at DESC`
  );
}
export async function createEducationCourse(
  input: { code?: string | null; nameI18n: I18nText; validityMonths?: number; isMandatory?: boolean; sportId?: UUID | null },
  actor: Actor = {}
): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO antidoping.education_course (code, name_i18n, sport_id, validity_months, is_mandatory)
       VALUES ($1,$2::jsonb,$3,$4,$5) RETURNING id`,
      [input.code ?? null, JSON.stringify(input.nameI18n), input.sportId ?? null,
       input.validityMonths ?? 12, input.isMandatory ?? true]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'education_course', entityId: row.id,
        action: 'INSERT', after: { code: input.code ?? null } },
      client
    );
    return row.id;
  });
}

/** 교육 이수 기록 + registration.eligibility.antidoping 채움(대회 자격 게이트 충족). */
export async function recordEducationCompletion(
  input: { courseId: UUID; personId: UUID; sportId?: UUID | null; score?: number | null; completedOn?: string | null },
  actor: Actor = {}
): Promise<UUID | null> {
  // 유효기간 계산용 과정 정보는 tx 밖에서 읽는다.
  const course = await queryOne<{ validity_months: number }>(
    `SELECT validity_months FROM antidoping.education_course WHERE id=$1`, [input.courseId]
  );
  const registrationId = input.sportId
    ? (await queryOne<{ id: UUID }>(
        `SELECT id FROM sport.registration WHERE person_id=$1 AND sport_id=$2 AND reg_type='ATHLETE'
          ORDER BY created_at DESC LIMIT 1`, [input.personId, input.sportId]
      ))?.id ?? null
    : null;

  const recId = await tx(async (client) => {
    const res = await client.query<{ id: UUID; completed_on: string }>(
      `INSERT INTO antidoping.education_record (course_id, person_id, registration_id, completed_on, expires_on, score)
       VALUES ($1,$2,$3, COALESCE($4::date, CURRENT_DATE),
               COALESCE($4::date, CURRENT_DATE) + ($5 || ' months')::interval, $6)
       ON CONFLICT (course_id, person_id, completed_on) DO NOTHING
       RETURNING id, completed_on::text AS completed_on`,
      [input.courseId, input.personId, registrationId, input.completedOn ?? null,
       String(course?.validity_months ?? 12), input.score ?? null]
    );
    const rec = res.rows[0];
    if (!rec) return null;
    // 자격 게이트 충족: 해당 종목 등록의 eligibility 에 antidoping 이수일 머지.
    if (registrationId) {
      await client.query(
        `UPDATE sport.registration
            SET eligibility = eligibility || jsonb_build_object('antidoping', $2::text), updated_at=now()
          WHERE id=$1`,
        [registrationId, rec.completed_on]
      );
    }
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'education_record', entityId: rec.id,
        action: 'EDUCATE', after: { person: input.personId, course: input.courseId } },
      client
    );
    return rec.id;
  });
  // 이수증 발급(진위확인 코드) — 별도 트랜잭션. 실패해도 이수 기록은 유지.
  if (recId) {
    try {
      const cert = await issueCertificate(
        { personId: input.personId, orgId: actor.orgId ?? null, certType: 'ANTIDOPING_EDU',
          title: 'Chứng nhận tập huấn phòng chống doping · 도핑방지 교육 이수증' },
        actor
      );
      await query(`UPDATE antidoping.education_record SET cert_document_id=$2, verify_code=$3 WHERE id=$1`, [recId, cert.id, cert.verify_code]);
    } catch { /* 발급 실패는 이수를 막지 않는다 */ }
  }
  return recId;
}

// ── 치료목적 사용면책 (TUE) ───────────────────────────────────────────────

export type TueDecision = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface TueRow {
  id: UUID; person_id: UUID; full_name: string; sport_id: UUID | null; sport_name: I18nText | null;
  substance: string; reason: string | null; valid_from: string | null; valid_to: string | null;
  decision: TueDecision; verify_code: string | null; created_at: string;
}
export async function listTue(filter: { decision?: TueDecision | null } = {}): Promise<TueRow[]> {
  return query<TueRow>(
    `SELECT t.id, t.person_id, p.full_name, t.sport_id, s.name_i18n AS sport_name,
            t.substance, t.reason, t.valid_from::text AS valid_from, t.valid_to::text AS valid_to,
            t.decision, t.verify_code, t.created_at::text AS created_at
       FROM antidoping.tue t
       JOIN core.person p ON p.id = t.person_id
       LEFT JOIN sport.sport s ON s.id = t.sport_id
      WHERE ($1::text IS NULL OR t.decision = $1)
      ORDER BY CASE t.decision WHEN 'PENDING' THEN 0 ELSE 1 END, t.created_at DESC`,
    [filter.decision ?? null]
  );
}
export interface SubmitTueInput {
  personId: UUID; sportId?: UUID | null; substance: string; reason?: string | null;
  validFrom?: string | null; validTo?: string | null;
}
export async function submitTue(input: SubmitTueInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO antidoping.tue (person_id, sport_id, substance, reason, valid_from, valid_to)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.personId, input.sportId ?? null, input.substance, input.reason ?? null, input.validFrom ?? null, input.validTo ?? null]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'tue', entityId: row.id, action: 'SUBMIT_TUE',
        after: { person: input.personId, substance: input.substance } }, client
    );
    return row.id;
  });
}
/** TUE 심의 결정. 승인 시 진위확인 가능한 면책 승인서를 발급한다(별도 tx). */
export async function decideTue(tueId: UUID, decision: 'APPROVED' | 'REJECTED', actor: Actor = {}): Promise<void> {
  const tueRow = await tx(async (client) => {
    await client.query(
      `UPDATE antidoping.tue SET decision=$2, decided_by=$3, decided_at=now() WHERE id=$1`,
      [tueId, decision, actor.personId ?? null]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'antidoping', entityTable: 'tue', entityId: tueId, action: 'DECIDE_TUE', after: { decision } }, client
    );
    return (await client.query<{ person_id: UUID }>(`SELECT person_id FROM antidoping.tue WHERE id=$1`, [tueId])).rows[0];
  });
  if (decision === 'APPROVED' && tueRow) {
    try {
      const cert = await issueCertificate(
        { personId: tueRow.person_id, orgId: actor.orgId ?? null, certType: 'ANTIDOPING_TUE',
          title: 'Miễn trừ sử dụng vì mục đích điều trị (TUE) · 치료목적 사용면책 승인서' },
        actor
      );
      await query(`UPDATE antidoping.tue SET cert_document_id=$2, verify_code=$3 WHERE id=$1`, [tueId, cert.id, cert.verify_code]);
    } catch { /* 발급 실패는 심의 결정을 막지 않는다 */ }
  }
}

// ── 요약/집계 ─────────────────────────────────────────────────────────────
export interface AntidopingOverview {
  pendingTests: number; aafCount: number; activeSanctions: number; educationRecords: number;
}
export async function getAntidopingOverview(): Promise<AntidopingOverview> {
  const r = (await query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM antidoping.test WHERE outcome='PENDING') AS pending_tests,
       (SELECT count(*) FROM antidoping.test WHERE outcome='AAF') AS aaf_count,
       (SELECT count(*) FROM antidoping.sanction WHERE status='ACTIVE') AS active_sanctions,
       (SELECT count(*) FROM antidoping.education_record) AS education_records`
  ))[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return { pendingTests: n('pending_tests'), aafCount: n('aaf_count'), activeSanctions: n('active_sanctions'), educationRecords: n('education_records') };
}
