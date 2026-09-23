/**
 * 지도자 자격·연수.
 *
 * 등급 카탈로그 + 연수 과정(취득/보수) + 개인 자격(유효기간·갱신).
 * 보수교육(REFRESHER) 이수시간을 채우면 자격을 갱신한다(만료 연장).
 * 기존 지도자 등록(sport.registration reg_type='COACH')의 갭(등급·유효기간·갱신)을 메운다.
 */
import { randomInt } from 'node:crypto';
import { query, queryOne, tx, writeAudit, type UUID, type I18nText } from '@vsp/core-admin';

export type GradeStatus = 'ACTIVE' | 'ARCHIVED';
export type CourseType = 'QUALIFICATION' | 'REFRESHER';
export type CourseStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'FINISHED';
export type EnrollmentStatus = 'ENROLLED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type CoachCredentialStatus = 'VALID' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED';

type Actor = { personId?: UUID | null; orgId?: UUID | null };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeVerifyCode(): string {
  let s = 'C-';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

// ── 등급 ──────────────────────────────────────────────────────────────────

export interface GradeRow {
  id: UUID; sport_id: UUID | null; sport_name: I18nText | null; code: string; name_i18n: I18nText;
  level_order: number; validity_years: number; refresher_hours_required: number; status: GradeStatus;
  credential_count: number;
}
export async function listGrades(filter: { sportId?: UUID | null } = {}): Promise<GradeRow[]> {
  return query<GradeRow>(
    `SELECT g.id, g.sport_id, s.name_i18n AS sport_name, g.code, g.name_i18n, g.level_order,
            g.validity_years, g.refresher_hours_required, g.status,
            (SELECT count(*)::int FROM coach.credential c WHERE c.grade_id=g.id AND c.status='VALID') AS credential_count
       FROM coach.grade g
       LEFT JOIN sport.sport s ON s.id = g.sport_id
      WHERE ($1::uuid IS NULL OR g.sport_id IS NOT DISTINCT FROM $1)
        AND g.status='ACTIVE'
      ORDER BY g.level_order, g.code`,
    [filter.sportId ?? null]
  );
}
export interface UpsertGradeInput {
  id?: UUID | null; sportId?: UUID | null; code: string; nameI18n: I18nText;
  levelOrder?: number; validityYears?: number; refresherHoursRequired?: number;
}
export async function upsertGrade(input: UpsertGradeInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    let id = input.id ?? null;
    if (id) {
      await client.query(
        `UPDATE coach.grade SET name_i18n=$2::jsonb, level_order=$3, validity_years=$4, refresher_hours_required=$5 WHERE id=$1`,
        [id, JSON.stringify(input.nameI18n), input.levelOrder ?? 1, input.validityYears ?? 4, input.refresherHoursRequired ?? 0]
      );
    } else {
      id = (await client.query<{ id: UUID }>(
        `INSERT INTO coach.grade (sport_id, code, name_i18n, level_order, validity_years, refresher_hours_required)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6) RETURNING id`,
        [input.sportId ?? null, input.code, JSON.stringify(input.nameI18n), input.levelOrder ?? 1,
         input.validityYears ?? 4, input.refresherHoursRequired ?? 0]
      )).rows[0].id;
    }
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'grade', entityId: id!, action: input.id ? 'UPDATE' : 'INSERT',
        after: { code: input.code } }, client
    );
    return id!;
  });
}

// ── 연수 과정 ─────────────────────────────────────────────────────────────

export interface CourseRow {
  id: UUID; grade_id: UUID | null; sport_id: UUID | null; sport_name: I18nText | null;
  code: string | null; name_i18n: I18nText; course_type: CourseType; hours: number; capacity: number | null;
  starts_on: string | null; ends_on: string | null; status: CourseStatus; enrolled_count: number;
}
export async function listCourses(filter: { status?: CourseStatus | null; courseType?: CourseType | null } = {}): Promise<CourseRow[]> {
  return query<CourseRow>(
    `SELECT c.id, c.grade_id, c.sport_id, s.name_i18n AS sport_name, c.code, c.name_i18n, c.course_type,
            c.hours, c.capacity, c.starts_on::text AS starts_on, c.ends_on::text AS ends_on, c.status,
            (SELECT count(*)::int FROM coach.course_enrollment e WHERE e.course_id=c.id AND e.status<>'CANCELLED') AS enrolled_count
       FROM coach.course c
       LEFT JOIN sport.sport s ON s.id = c.sport_id
      WHERE ($1::text IS NULL OR c.status=$1) AND ($2::text IS NULL OR c.course_type=$2)
      ORDER BY c.created_at DESC`,
    [filter.status ?? null, filter.courseType ?? null]
  );
}
export async function getCourse(id: UUID): Promise<CourseRow | null> {
  const rows = await listCourses({});
  return rows.find((c) => c.id === id) ?? null;
}
export interface CreateCourseInput {
  gradeId?: UUID | null; sportId?: UUID | null; code?: string | null; nameI18n: I18nText;
  courseType?: CourseType; hours?: number; capacity?: number | null; startsOn?: string | null; endsOn?: string | null;
}
export async function createCourse(input: CreateCourseInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO coach.course (grade_id, sport_id, code, name_i18n, course_type, hours, capacity, starts_on, ends_on, status)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,'OPEN') RETURNING id`,
      [input.gradeId ?? null, input.sportId ?? null, input.code ?? null, JSON.stringify(input.nameI18n),
       input.courseType ?? 'REFRESHER', input.hours ?? 0, input.capacity ?? null, input.startsOn ?? null, input.endsOn ?? null]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'course', entityId: row.id, action: 'INSERT',
        after: { type: input.courseType ?? 'REFRESHER', hours: input.hours ?? 0 } }, client
    );
    return row.id;
  });
}
const COURSE_STATUSES: CourseStatus[] = ['DRAFT', 'OPEN', 'CLOSED', 'FINISHED'];
export async function setCourseStatus(courseId: UUID, status: CourseStatus, actor: Actor = {}): Promise<void> {
  if (!COURSE_STATUSES.includes(status)) throw new Error('invalid course status');
  await tx(async (client) => {
    await client.query(`UPDATE coach.course SET status=$2 WHERE id=$1`, [courseId, status]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'course', entityId: courseId, action: 'STATUS', after: { status } }, client
    );
  });
}

export interface CourseEnrollmentRow {
  id: UUID; person_id: UUID; full_name: string; status: EnrollmentStatus;
  hours_earned: number | null; score: number | null; completed_on: string | null;
}
export async function listCourseEnrollments(courseId: UUID): Promise<CourseEnrollmentRow[]> {
  return query<CourseEnrollmentRow>(
    `SELECT e.id, e.person_id, p.full_name, e.status, e.hours_earned, e.score, e.completed_on::text AS completed_on
       FROM coach.course_enrollment e JOIN core.person p ON p.id = e.person_id
      WHERE e.course_id = $1 ORDER BY p.full_name`,
    [courseId]
  );
}
export async function enrollCourse(courseId: UUID, personId: UUID, actor: Actor = {}): Promise<UUID | null> {
  return tx(async (client) => {
    const res = await client.query<{ id: UUID }>(
      `INSERT INTO coach.course_enrollment (course_id, person_id) VALUES ($1,$2)
       ON CONFLICT (course_id, person_id) DO NOTHING RETURNING id`,
      [courseId, personId]
    );
    const id = res.rows[0]?.id ?? null;
    if (id) await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'course_enrollment', entityId: id, action: 'ENROLL' }, client
    );
    return id;
  });
}
/** 이수 처리 — COMPLETED 면 이수시간을 과정 hours 로 채운다(미지정 시). */
export async function markCompletion(
  enrollmentId: UUID,
  input: { status: EnrollmentStatus; hoursEarned?: number | null; score?: number | null; completedOn?: string | null },
  actor: Actor = {}
): Promise<void> {
  await tx(async (client) => {
    let hours = input.hoursEarned ?? null;
    if (input.status === 'COMPLETED' && hours == null) {
      hours = (await client.query<{ hours: number }>(
        `SELECT c.hours FROM coach.course_enrollment e JOIN coach.course c ON c.id=e.course_id WHERE e.id=$1`, [enrollmentId]
      )).rows[0]?.hours ?? 0;
    }
    await client.query(
      `UPDATE coach.course_enrollment
          SET status=$2, hours_earned=$3, score=$4,
              completed_on = CASE WHEN $2='COMPLETED' THEN COALESCE($5::date, CURRENT_DATE) ELSE completed_on END
        WHERE id=$1`,
      [enrollmentId, input.status, hours, input.score ?? null, input.completedOn ?? null]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'course_enrollment', entityId: enrollmentId, action: 'COMPLETION',
        after: { status: input.status, hours } }, client
    );
  });
}

// ── 자격(대장) ────────────────────────────────────────────────────────────

export interface CoachCredentialRow {
  id: UUID; person_id: UUID; full_name: string; grade_id: UUID; grade_name: I18nText; level_order: number;
  sport_id: UUID | null; sport_name: I18nText | null; obtained_on: string; expires_on: string | null;
  last_renewed_on: string | null; status: CoachCredentialStatus; verify_code: string | null;
}
export async function listCredentials(
  filter: { status?: CoachCredentialStatus | null; sportId?: UUID | null; personId?: UUID | null } = {}
): Promise<CoachCredentialRow[]> {
  return query<CoachCredentialRow>(
    `SELECT cr.id, cr.person_id, p.full_name, cr.grade_id, g.name_i18n AS grade_name, g.level_order,
            cr.sport_id, s.name_i18n AS sport_name, cr.obtained_on::text AS obtained_on, cr.expires_on::text AS expires_on,
            cr.last_renewed_on::text AS last_renewed_on, cr.status, cr.verify_code
       FROM coach.credential cr
       JOIN core.person p ON p.id = cr.person_id
       JOIN coach.grade g ON g.id = cr.grade_id
       LEFT JOIN sport.sport s ON s.id = cr.sport_id
      WHERE ($1::text IS NULL OR cr.status=$1)
        AND ($2::uuid IS NULL OR cr.sport_id=$2)
        AND ($3::uuid IS NULL OR cr.person_id=$3)
      ORDER BY cr.expires_on NULLS LAST, p.full_name`,
    [filter.status ?? null, filter.sportId ?? null, filter.personId ?? null]
  );
}
export async function listExpiringCredentials(withinDays = 90): Promise<CoachCredentialRow[]> {
  return query<CoachCredentialRow>(
    `SELECT cr.id, cr.person_id, p.full_name, cr.grade_id, g.name_i18n AS grade_name, g.level_order,
            cr.sport_id, s.name_i18n AS sport_name, cr.obtained_on::text AS obtained_on, cr.expires_on::text AS expires_on,
            cr.last_renewed_on::text AS last_renewed_on, cr.status, cr.verify_code
       FROM coach.credential cr
       JOIN core.person p ON p.id = cr.person_id
       JOIN coach.grade g ON g.id = cr.grade_id
       LEFT JOIN sport.sport s ON s.id = cr.sport_id
      WHERE cr.status='VALID' AND cr.expires_on IS NOT NULL
        AND cr.expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
      ORDER BY cr.expires_on`,
    [String(withinDays)]
  );
}

export interface GrantCredentialInput { personId: UUID; gradeId: UUID; sportId?: UUID | null; obtainedOn?: string | null; }
export async function grantCredential(input: GrantCredentialInput, actor: Actor = {}): Promise<UUID> {
  const grade = await queryOne<{ validity_years: number }>(`SELECT validity_years FROM coach.grade WHERE id=$1`, [input.gradeId]);
  const verifyCode = makeVerifyCode();
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO coach.credential (person_id, grade_id, sport_id, obtained_on, expires_on, status, verify_code)
       VALUES ($1,$2,$3, COALESCE($4::date, CURRENT_DATE),
               COALESCE($4::date, CURRENT_DATE) + ($5 || ' years')::interval, 'VALID', $6)
       RETURNING id`,
      [input.personId, input.gradeId, input.sportId ?? null, input.obtainedOn ?? null,
       String(grade?.validity_years ?? 4), verifyCode]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'credential', entityId: row.id, action: 'GRANT',
        after: { person: input.personId, grade: input.gradeId } }, client
    );
    return row.id;
  });
}

export class RefresherHoursError extends Error {
  constructor(public required: number, public earned: number) { super('REFRESHER_HOURS_MISSING'); }
}
/** 갱신 — 직전 주기 이후 보수교육 이수시간이 기준 이상이면 만료를 연장한다. */
export async function renewCredential(credentialId: UUID, actor: Actor = {}): Promise<void> {
  const cred = await queryOne<{ person_id: UUID; grade_id: UUID; obtained_on: string; last_renewed_on: string | null; expires_on: string | null }>(
    `SELECT person_id, grade_id, obtained_on::text, last_renewed_on::text, expires_on::text FROM coach.credential WHERE id=$1`, [credentialId]
  );
  if (!cred) throw new Error('credential not found');
  const grade = await queryOne<{ validity_years: number; refresher_hours_required: number }>(
    `SELECT validity_years, refresher_hours_required FROM coach.grade WHERE id=$1`, [cred.grade_id]
  );
  const since = cred.last_renewed_on ?? cred.obtained_on;
  const earned = (await queryOne<{ h: string }>(
    `SELECT COALESCE(sum(e.hours_earned),0)::text AS h
       FROM coach.course_enrollment e JOIN coach.course c ON c.id=e.course_id
      WHERE e.person_id=$1 AND e.status='COMPLETED' AND c.course_type='REFRESHER'
        AND e.completed_on > $2::date`,
    [cred.person_id, since]
  ))?.h;
  const earnedN = Number(earned ?? 0);
  const required = grade?.refresher_hours_required ?? 0;
  if (earnedN < required) throw new RefresherHoursError(required, earnedN);

  await tx(async (client) => {
    await client.query(
      `UPDATE coach.credential
          SET expires_on = GREATEST(COALESCE(expires_on, CURRENT_DATE), CURRENT_DATE) + ($2 || ' years')::interval,
              last_renewed_on = CURRENT_DATE, status='VALID'
        WHERE id=$1`,
      [credentialId, String(grade?.validity_years ?? 4)]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'credential', entityId: credentialId, action: 'RENEW',
        after: { refresher_hours: earnedN } }, client
    );
  });
}

const REVOKE_STATUSES: CoachCredentialStatus[] = ['SUSPENDED', 'REVOKED', 'VALID'];
export async function setCoachCredentialStatus(credentialId: UUID, status: CoachCredentialStatus, actor: Actor = {}, reason?: string | null): Promise<void> {
  if (!REVOKE_STATUSES.includes(status)) throw new Error('invalid credential status');
  await tx(async (client) => {
    await client.query(`UPDATE coach.credential SET status=$2 WHERE id=$1`, [credentialId, status]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'coach', entityTable: 'credential', entityId: credentialId, action: 'CRED_STATUS',
        after: { status }, note: reason ?? null }, client
    );
  });
}

// ── 집계 ──────────────────────────────────────────────────────────────────
export interface CoachingOverview { validCredentials: number; expiringSoon: number; openCourses: number; grades: number; }
export async function getCoachingOverview(): Promise<CoachingOverview> {
  const r = (await query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM coach.credential WHERE status='VALID') AS valid_credentials,
       (SELECT count(*) FROM coach.credential WHERE status='VALID' AND expires_on IS NOT NULL
          AND expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 90) AS expiring_soon,
       (SELECT count(*) FROM coach.course WHERE status='OPEN') AS open_courses,
       (SELECT count(*) FROM coach.grade WHERE status='ACTIVE') AS grades`
  ))[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return { validCredentials: n('valid_credentials'), expiringSoon: n('expiring_soon'), openCourses: n('open_courses'), grades: n('grades') };
}
