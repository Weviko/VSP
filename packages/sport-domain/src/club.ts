/**
 * 생활체육 클럽·동호인.
 *
 * 비경쟁 커뮤니티 단위(sport.team·registration 과 별개). 클럽 등록은 결재로 승인하고,
 * 동호인 회원·프로그램(강좌)·수강을 관리한다. 회원 탈퇴는 소프트 종료(left_on)로 이력을 남긴다.
 */
import { query, queryOne, tx, writeAudit, type UUID, type I18nText } from '@vsp/core-admin';

export type ClubType = 'COMMUNITY' | 'PUBLIC' | 'DESIGNATED';
export type ClubStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'CLOSED';
export type MemberRole = 'MEMBER' | 'LEADER' | 'INSTRUCTOR';
export type ProgramCategory = 'YOUTH' | 'ADULT' | 'SENIOR' | 'PARA' | 'ALL';
export type ProgramStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'FINISHED';

type Actor = { personId?: UUID | null; orgId?: UUID | null };

// ── 클럽 ──────────────────────────────────────────────────────────────────

export interface ClubRow {
  id: UUID; name_i18n: I18nText; short_name: string | null; sport_id: UUID; sport_name: I18nText;
  region_code: string | null; club_type: ClubType; venue_text: string | null;
  representative_name: string | null; status: ClubStatus; approved_at: string | null;
  member_count: number; program_count: number;
}

export async function listClubs(
  filter: { regionCode?: string | null; sportId?: UUID | null; status?: ClubStatus | null; clubType?: ClubType | null } = {}
): Promise<ClubRow[]> {
  return query<ClubRow>(
    `SELECT c.id, c.name_i18n, c.short_name, c.sport_id, s.name_i18n AS sport_name,
            c.region_code, c.club_type, c.venue_text, rp.full_name AS representative_name,
            c.status, c.approved_at::text AS approved_at,
            (SELECT count(*)::int FROM sport.club_member m WHERE m.club_id=c.id AND m.status='ACTIVE') AS member_count,
            (SELECT count(*)::int FROM sport.club_program pr WHERE pr.club_id=c.id) AS program_count
       FROM sport.club c
       JOIN sport.sport s ON s.id = c.sport_id
       LEFT JOIN core.person rp ON rp.id = c.representative_person_id
      WHERE ($1::text IS NULL OR c.region_code = $1)
        AND ($2::uuid IS NULL OR c.sport_id = $2)
        AND ($3::text IS NULL OR c.status = $3)
        AND ($4::text IS NULL OR c.club_type = $4)
      ORDER BY
        CASE c.status WHEN 'SUBMITTED' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
        s.name_i18n->>'vi', c.name_i18n->>'vi'`,
    [filter.regionCode ?? null, filter.sportId ?? null, filter.status ?? null, filter.clubType ?? null]
  );
}

export async function getClub(id: UUID): Promise<ClubRow | null> {
  const rows = await query<ClubRow>(
    `SELECT c.id, c.name_i18n, c.short_name, c.sport_id, s.name_i18n AS sport_name,
            c.region_code, c.club_type, c.venue_text, rp.full_name AS representative_name,
            c.status, c.approved_at::text AS approved_at,
            (SELECT count(*)::int FROM sport.club_member m WHERE m.club_id=c.id AND m.status='ACTIVE') AS member_count,
            (SELECT count(*)::int FROM sport.club_program pr WHERE pr.club_id=c.id) AS program_count
       FROM sport.club c
       JOIN sport.sport s ON s.id = c.sport_id
       LEFT JOIN core.person rp ON rp.id = c.representative_person_id
      WHERE c.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export interface CreateClubInput {
  orgId?: UUID | null; sportId: UUID; nameI18n: I18nText; shortName?: string | null; regionCode?: string | null;
  clubType?: ClubType; venueText?: string | null; representativePersonId?: UUID | null;
  foundedOn?: string | null; memberCapacity?: number | null;
}
export async function createClub(input: CreateClubInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO sport.club
         (org_id, sport_id, name_i18n, short_name, region_code, club_type, venue_text,
          representative_person_id, founded_on, member_capacity, status)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED') RETURNING id`,
      [input.orgId ?? null, input.sportId, JSON.stringify(input.nameI18n), input.shortName ?? null,
       input.regionCode ?? null, input.clubType ?? 'COMMUNITY', input.venueText ?? null,
       input.representativePersonId ?? null, input.foundedOn ?? null, input.memberCapacity ?? null]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club', entityId: row.id, action: 'INSERT',
        after: { name: input.nameI18n, region: input.regionCode ?? null } },
      client
    );
    return row.id;
  });
}

export async function approveClub(clubId: UUID, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    await client.query(`UPDATE sport.club SET status='APPROVED', approved_at=now(), updated_at=now() WHERE id=$1`, [clubId]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club', entityId: clubId, action: 'APPROVE' }, client
    );
  });
}
export async function rejectClub(clubId: UUID, actor: Actor = {}, reason?: string | null): Promise<void> {
  await tx(async (client) => {
    await client.query(`UPDATE sport.club SET status='REJECTED', updated_at=now() WHERE id=$1`, [clubId]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club', entityId: clubId, action: 'REJECT',
        after: { reason: reason ?? null }, note: reason ?? null }, client
    );
  });
}

// ── 회원 ──────────────────────────────────────────────────────────────────

export interface ClubMemberRow {
  id: UUID; person_id: UUID; full_name: string; member_no: string | null;
  role: MemberRole; joined_on: string; status: string;
}
export async function listClubMembers(clubId: UUID): Promise<ClubMemberRow[]> {
  return query<ClubMemberRow>(
    `SELECT m.id, m.person_id, p.full_name, m.member_no, m.role, m.joined_on::text AS joined_on, m.status
       FROM sport.club_member m JOIN core.person p ON p.id = m.person_id
      WHERE m.club_id = $1 AND m.status = 'ACTIVE'
      ORDER BY CASE m.role WHEN 'LEADER' THEN 0 WHEN 'INSTRUCTOR' THEN 1 ELSE 2 END, m.joined_on`,
    [clubId]
  );
}
export async function addClubMember(
  input: { clubId: UUID; personId: UUID; role?: MemberRole; memberNo?: string | null }, actor: Actor = {}
): Promise<UUID | null> {
  return tx(async (client) => {
    const res = await client.query<{ id: UUID }>(
      `INSERT INTO sport.club_member (club_id, person_id, role, member_no)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (club_id, person_id) DO UPDATE SET status='ACTIVE', left_on=NULL, role=EXCLUDED.role
       RETURNING id`,
      [input.clubId, input.personId, input.role ?? 'MEMBER', input.memberNo ?? null]
    );
    const id = res.rows[0]?.id ?? null;
    if (id) await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club_member', entityId: id, action: 'ADD_MEMBER',
        after: { club: input.clubId, person: input.personId } }, client
    );
    return id;
  });
}
export async function endClubMembership(memberId: UUID, actor: Actor = {}, endOn?: string | null): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `UPDATE sport.club_member SET status='INACTIVE', left_on=COALESCE($2::date, CURRENT_DATE) WHERE id=$1`,
      [memberId, endOn ?? null]
    );
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club_member', entityId: memberId, action: 'END_MEMBER' }, client
    );
  });
}

// ── 프로그램 + 수강 ───────────────────────────────────────────────────────

export interface ProgramRow {
  id: UUID; club_id: UUID; name_i18n: I18nText; category: ProgramCategory; schedule_text: string | null;
  capacity: number | null; starts_on: string | null; ends_on: string | null; is_public: boolean;
  status: ProgramStatus; enrolled_count: number;
}
export async function listPrograms(clubId: UUID): Promise<ProgramRow[]> {
  return query<ProgramRow>(
    `SELECT pr.id, pr.club_id, pr.name_i18n, pr.category, pr.schedule_text, pr.capacity,
            pr.starts_on::text AS starts_on, pr.ends_on::text AS ends_on, pr.is_public, pr.status,
            (SELECT count(*)::int FROM sport.club_program_enrollment e WHERE e.program_id=pr.id AND e.status='CONFIRMED') AS enrolled_count
       FROM sport.club_program pr WHERE pr.club_id = $1 ORDER BY pr.created_at DESC`,
    [clubId]
  );
}
export interface CreateClubProgramInput {
  clubId: UUID; sportId?: UUID | null; nameI18n: I18nText; category?: ProgramCategory;
  scheduleText?: string | null; capacity?: number | null; startsOn?: string | null; endsOn?: string | null; isPublic?: boolean;
}
export async function createClubProgram(input: CreateClubProgramInput, actor: Actor = {}): Promise<UUID> {
  return tx(async (client) => {
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO sport.club_program
         (club_id, sport_id, name_i18n, category, schedule_text, capacity, starts_on, ends_on, is_public, status)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,'OPEN') RETURNING id`,
      [input.clubId, input.sportId ?? null, JSON.stringify(input.nameI18n), input.category ?? 'ALL',
       input.scheduleText ?? null, input.capacity ?? null, input.startsOn ?? null, input.endsOn ?? null, input.isPublic ?? true]
    )).rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club_program', entityId: row.id, action: 'INSERT',
        after: { club: input.clubId, name: input.nameI18n } }, client
    );
    return row.id;
  });
}
const PROGRAM_STATUSES: ProgramStatus[] = ['DRAFT', 'OPEN', 'CLOSED', 'FINISHED'];
export async function setClubProgramStatus(programId: UUID, status: ProgramStatus, actor: Actor = {}): Promise<void> {
  if (!PROGRAM_STATUSES.includes(status)) throw new Error('invalid program status');
  await tx(async (client) => {
    await client.query(`UPDATE sport.club_program SET status=$2 WHERE id=$1`, [programId, status]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club_program', entityId: programId, action: 'STATUS',
        after: { status } }, client
    );
  });
}

export interface EnrollmentRow {
  id: UUID; club_member_id: UUID; full_name: string; enrolled_on: string; status: string;
}
export async function listEnrollments(programId: UUID): Promise<EnrollmentRow[]> {
  return query<EnrollmentRow>(
    `SELECT e.id, e.club_member_id, p.full_name, e.enrolled_on::text AS enrolled_on, e.status
       FROM sport.club_program_enrollment e
       JOIN sport.club_member m ON m.id = e.club_member_id
       JOIN core.person p ON p.id = m.person_id
      WHERE e.program_id = $1 ORDER BY e.enrolled_on`,
    [programId]
  );
}
export class ProgramFullError extends Error { constructor() { super('PROGRAM_FULL'); } }
export async function enrollMember(input: { programId: UUID; clubMemberId: UUID }, actor: Actor = {}): Promise<UUID | null> {
  return tx(async (client) => {
    const cap = (await client.query<{ capacity: number | null; n: string }>(
      `SELECT pr.capacity,
              (SELECT count(*)::text FROM sport.club_program_enrollment e WHERE e.program_id=pr.id AND e.status='CONFIRMED') AS n
         FROM sport.club_program pr WHERE pr.id=$1`, [input.programId]
    )).rows[0];
    if (cap?.capacity != null && Number(cap.n) >= cap.capacity) throw new ProgramFullError();
    const res = await client.query<{ id: UUID }>(
      `INSERT INTO sport.club_program_enrollment (program_id, club_member_id, status)
       VALUES ($1,$2,'CONFIRMED')
       ON CONFLICT (program_id, club_member_id) DO UPDATE SET status='CONFIRMED'
       RETURNING id`,
      [input.programId, input.clubMemberId]
    );
    const id = res.rows[0]?.id ?? null;
    if (id) await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club_program_enrollment', entityId: id, action: 'ENROLL' }, client
    );
    return id;
  });
}
export async function cancelEnrollment(enrollmentId: UUID, actor: Actor = {}): Promise<void> {
  await tx(async (client) => {
    await client.query(`UPDATE sport.club_program_enrollment SET status='CANCELLED' WHERE id=$1`, [enrollmentId]);
    await writeAudit(
      { actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'sport', entityTable: 'club_program_enrollment', entityId: enrollmentId, action: 'CANCEL_ENROLL' }, client
    );
  });
}

// ── 집계 ──────────────────────────────────────────────────────────────────
export interface ClubStats { clubs: number; members: number; programs: number; designated: number; pending: number; }
export async function getClubStats(): Promise<ClubStats> {
  const r = (await query<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM sport.club WHERE status='APPROVED') AS clubs,
       (SELECT count(*) FROM sport.club_member WHERE status='ACTIVE') AS members,
       (SELECT count(*) FROM sport.club_program WHERE status='OPEN') AS programs,
       (SELECT count(*) FROM sport.club WHERE status='APPROVED' AND club_type='DESIGNATED') AS designated,
       (SELECT count(*) FROM sport.club WHERE status='SUBMITTED') AS pending`
  ))[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return { clubs: n('clubs'), members: n('members'), programs: n('programs'), designated: n('designated'), pending: n('pending') };
}
