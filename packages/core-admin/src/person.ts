/**
 * 사람 조회 — 업무 화면의 사람 선택기(typeahead)용.
 *
 * 기자 자격 발급처럼 "사람 하나를 골라야" 하는 화면에서 UUID 를 직접 붙여넣게 하면
 * 실수·오배정이 난다. 이름(라틴 포함)이나 전화번호로 찾아 고르게 한다.
 * 업무자만 부른다(호출부에서 requireWorkspace). 내부 화면이므로 출생'연도'까지만 돌려주고
 * 신분증 원문은 절대 싣지 않는다.
 */
import { createHash } from 'node:crypto';
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface PersonHit {
  id: UUID;
  full_name: string;
  name_latin: string | null;
  birth_year: number | null;
  phone: string | null;
}

/**
 * 이름/전화번호로 사람을 찾는다. 2글자 미만이면 빈 결과(오타 한 글자로 전체를 긁지 않게).
 * 대량 조회를 막기 위해 상한을 둔다(기본 10, 최대 50).
 */
export async function searchPersons(
  q: string,
  opts: { limit?: number } = {}
): Promise<PersonHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  return query<PersonHit>(
    `SELECT p.id, p.full_name, p.name_latin,
            EXTRACT(YEAR FROM p.birth_date)::int AS birth_year, p.phone
       FROM core.person p
      WHERE p.deleted_at IS NULL
        AND ( p.full_name ILIKE '%' || $1 || '%'
           OR p.name_latin ILIKE '%' || $1 || '%'
           OR p.phone      ILIKE '%' || $1 || '%')
      ORDER BY p.full_name
      LIMIT $2`,
    [term, limit]
  );
}

// ── 개별 인물 조회·수정·비활성 (업무자용) ─────────────────────────────────────

export interface PersonRecord {
  id: UUID;
  display_id: string | null;
  full_name: string;
  name_latin: string | null;
  gender: string | null;
  birth_date: string | null;
  nationality: string | null;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  id_doc_type: string | null;
  id_verified_at: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
}

/**
 * 인물 한 명 (업무 상세 화면용). 비활성(deleted_at)된 사람도 돌려준다 — 되살리기 위해 봐야 하므로.
 * 신분증 원문은 저장하지 않으므로 여기에도 없다(해시는 화면에 싣지 않는다).
 */
export async function getPerson(id: UUID): Promise<PersonRecord | null> {
  return queryOne<PersonRecord>(
    `SELECT id, display_id, full_name, name_latin, gender, birth_date::text,
            nationality, photo_url, phone, email, address, id_doc_type,
            id_verified_at::text, status, deleted_at::text, created_at::text
       FROM core.person WHERE id = $1`,
    [id]
  );
}

export interface CreatePersonInput {
  fullName: string;
  nameLatin?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  cccd?: string | null;   // 원문은 저장하지 않는다 — 중복 확인용 해시만 남긴다
}

/**
 * 인물 신규 등록(단건). 엑셀 일괄 등록·조직 배치 외에, 담당자가 한 명을 직접 추가하는 경로.
 * 신분증(CCCD)은 원문을 저장하지 않고 해시만 남긴다(개인정보보호령). 감사기록을 남긴다.
 */
export async function createPerson(
  input: CreatePersonInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<PersonRecord> {
  return tx(async (client) => {
    const cccdHash = input.cccd?.trim() ? sha256(input.cccd.trim()) : null;
    const res = await client.query<PersonRecord>(
      `INSERT INTO core.person
         (full_name, name_latin, gender, birth_date, phone, email, address, id_doc_type, id_doc_hash)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,
               CASE WHEN $8::text IS NULL THEN NULL ELSE 'CCCD' END, $8::text)
       RETURNING id, display_id, full_name, name_latin, gender, birth_date::text,
                 nationality, photo_url, phone, email, address, id_doc_type,
                 id_verified_at::text, status, deleted_at::text, created_at::text`,
      [
        input.fullName.trim(), input.nameLatin?.trim() || null, input.gender || null,
        input.birthDate || null, input.phone?.trim() || null, input.email?.trim() || null,
        input.address?.trim() || null, cccdHash,
      ]
    );
    const p = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'person', entityId: p.id,
        action: 'INSERT', after: { full_name: p.full_name },
      },
      client
    );
    return p;
  });
}

export interface PersonPatch {
  full_name?: string;
  name_latin?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

/**
 * 인물 정보 수정 (오탈자·연락처 정정 등). 신분증 해시는 여기서 건드리지 않는다(신원은 별도 절차).
 * 읽고-합치고-쓰기로 넘어온 값만 바꾸고, 변경 전/후를 감사기록에 남긴다(정부 감사 대비).
 */
export async function updatePerson(
  id: UUID,
  patch: PersonPatch,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<PersonRecord> {
  return tx(async (client) => {
    const before = (
      await client.query<PersonRecord>(`SELECT * FROM core.person WHERE id = $1 AND deleted_at IS NULL`, [id])
    ).rows[0];
    if (!before) throw new Error('person not found');

    const pick = <K extends keyof PersonPatch>(k: K, cur: unknown) =>
      patch[k] !== undefined ? patch[k] : cur;
    const merged = {
      full_name: patch.full_name?.trim() || before.full_name,
      name_latin: pick('name_latin', before.name_latin),
      gender: pick('gender', before.gender),
      birth_date: pick('birth_date', before.birth_date),
      phone: pick('phone', before.phone),
      email: pick('email', before.email),
      address: pick('address', before.address),
    };

    const res = await client.query<PersonRecord>(
      `UPDATE core.person
          SET full_name=$2, name_latin=$3, gender=$4, birth_date=$5::date,
              phone=$6, email=$7, address=$8, updated_at=now()
        WHERE id=$1
      RETURNING id, display_id, full_name, name_latin, gender, birth_date::text,
                nationality, photo_url, phone, email, address, id_doc_type,
                id_verified_at::text, status, deleted_at::text, created_at::text`,
      [id, merged.full_name, merged.name_latin, merged.gender, merged.birth_date,
       merged.phone, merged.email, merged.address]
    );
    const after = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'person', entityId: id,
        action: 'UPDATE', before, after,
      },
      client
    );
    return after;
  });
}

/**
 * 인물 비활성 (소프트 삭제). 지우지 않고 deleted_at 를 찍는다 —
 * 과거 등록·대회 기록이 이 사람을 참조하므로 물리 삭제하면 기록이 깨진다. 되살릴 수 있다.
 */
export async function deactivatePerson(
  id: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query<PersonRecord>(`SELECT * FROM core.person WHERE id=$1`, [id])).rows[0];
    if (!before || before.deleted_at) return; // 이미 없거나 이미 비활성
    await client.query(
      `UPDATE core.person SET deleted_at=now(), status='CLOSED', updated_at=now() WHERE id=$1`, [id]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'person', entityId: id,
        action: 'DEACTIVATE', before, after: { status: 'CLOSED', deleted_at: 'now()' },
      },
      client
    );
  });
}

/** 비활성 되돌리기. */
export async function reactivatePerson(
  id: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query<PersonRecord>(`SELECT * FROM core.person WHERE id=$1`, [id])).rows[0];
    if (!before || !before.deleted_at) return;
    await client.query(
      `UPDATE core.person SET deleted_at=NULL, status='ACTIVE', updated_at=now() WHERE id=$1`, [id]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'person', entityId: id,
        action: 'REACTIVATE', before, after: { status: 'ACTIVE', deleted_at: null },
      },
      client
    );
  });
}
