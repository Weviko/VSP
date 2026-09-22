/**
 * 조직 관리.
 * 무제한 깊이 트리를 재귀 CTE로 다룬다.
 * 2025년 베트남 행정구역 개편(63→34)처럼 계층이 바뀌어도 코드 수정이 없어야 한다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { Organization, OrgLevelType, OrgTreeNode, UUID } from './types';
import type { I18nText } from './i18n';

export async function listLevelTypes(): Promise<OrgLevelType[]> {
  return query<OrgLevelType>(
    `SELECT code, name_i18n, sort_order, description
       FROM core.org_level_type ORDER BY sort_order`
  );
}

export interface OrgHit {
  id: UUID;
  name_i18n: I18nText;
  display_id: string | null;
  level_type: string;
  region_code: string | null;
}

/**
 * 조직 검색 — 업무 화면의 조직 선택기(typeahead)용.
 * 이름(다국어)·코드·지역으로 찾는다. 2글자 미만은 빈 결과(대량 조회 방지). 활성 조직만.
 */
export async function searchOrgs(q: string, opts: { limit?: number } = {}): Promise<OrgHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  return query<OrgHit>(
    `SELECT id, name_i18n, display_id, level_type, region_code
       FROM core.organization
      WHERE deleted_at IS NULL AND status <> 'CLOSED'
        AND ( name_i18n->>'vi' ILIKE '%' || $1 || '%'
           OR name_i18n->>'en' ILIKE '%' || $1 || '%'
           OR name_i18n->>'ko' ILIKE '%' || $1 || '%'
           OR display_id ILIKE '%' || $1 || '%'
           OR region_code ILIKE '%' || $1 || '%')
      ORDER BY name_i18n->>'vi'
      LIMIT $2`,
    [term, limit]
  );
}

export async function getOrganization(
  id: UUID,
  opts: { includeDeleted?: boolean } = {}
): Promise<Organization | null> {
  // 상세·수정 화면은 비활성(deleted_at)된 조직도 봐야 한다 — 되살리기 위해.
  return queryOne<Organization>(
    `SELECT * FROM core.organization
      WHERE id = $1 AND ($2::boolean OR deleted_at IS NULL)`,
    [id, opts.includeDeleted ?? false]
  );
}

/** 특정 조직의 조상 경로 (빵부스러기 표시용) */
/**
 * 이 사람이 속한 조직 id 목록 (유효 기간 내 소속만).
 * 권한 판단에 쓴다 — "내 조직 것인가"는 첨부·문서·정산 어디서나 묻게 된다.
 */
export async function getMyOrgIds(personId: UUID | null): Promise<UUID[]> {
  if (!personId) return [];
  const rows = await query<{ org_id: UUID }>(
    `SELECT DISTINCT org_id FROM core.org_member
      WHERE person_id = $1
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
    [personId]
  );
  return rows.map((r) => r.org_id);
}

export async function getAncestors(id: UUID): Promise<Organization[]> {
  return query<Organization>(
    `WITH RECURSIVE up AS (
       SELECT o.*, 0 AS lvl FROM core.organization o WHERE o.id = $1
       UNION ALL
       SELECT p.*, up.lvl + 1 FROM core.organization p JOIN up ON up.parent_id = p.id
     )
     SELECT * FROM up WHERE id <> $1 ORDER BY lvl DESC`,
    [id]
  );
}

/**
 * 조직 트리 조회.
 * rootId가 없으면 최상위(부모 없음)부터. 폐지된 조직(effective_to 경과)은 기본 제외.
 */
export async function getOrgTree(opts: {
  rootId?: UUID | null;
  includeInactive?: boolean;
  maxDepth?: number;
} = {}): Promise<OrgTreeNode[]> {
  const { rootId = null, includeInactive = false, maxDepth = 10 } = opts;

  const rows = await query<Organization & { depth: number }>(
    `WITH RECURSIVE tree AS (
       SELECT o.*, 0 AS depth
         FROM core.organization o
        WHERE o.deleted_at IS NULL
          AND ($1::uuid IS NULL AND o.parent_id IS NULL OR o.id = $1::uuid)
       UNION ALL
       SELECT c.*, tree.depth + 1
         FROM core.organization c
         JOIN tree ON c.parent_id = tree.id
        WHERE c.deleted_at IS NULL AND tree.depth < $2
     )
     SELECT * FROM tree
      WHERE ($3::boolean OR (status = 'ACTIVE'
             AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)))
      ORDER BY depth, name_i18n->>'vi'`,
    [rootId, maxDepth, includeInactive]
  );

  // 평면 목록을 트리로 조립
  const byId = new Map<UUID, OrgTreeNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });

  const roots: OrgTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** 조직과 그 하위 전체의 id 목록 (권한 범위 계산에 사용) */
export async function getDescendantIds(rootId: UUID): Promise<UUID[]> {
  const rows = await query<{ id: UUID }>(`SELECT id FROM core.org_descendants($1)`, [rootId]);
  return rows.map((r) => r.id);
}

export interface CreateOrgInput {
  parentId?: UUID | null;
  levelType: string;
  nameI18n: I18nText;
  displayId?: string | null;
  shortName?: string | null;
  regionCode?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string;
}

export async function createOrganization(
  input: CreateOrgInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<Organization> {
  return tx(async (client) => {
    const res = await client.query<Organization>(
      `INSERT INTO core.organization
         (parent_id, level_type, name_i18n, display_id, short_name,
          region_code, tax_code, phone, email, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'PENDING'))
       RETURNING *`,
      [
        input.parentId ?? null,
        input.levelType,
        JSON.stringify(input.nameI18n),
        input.displayId ?? null,
        input.shortName ?? null,
        input.regionCode ?? null,
        input.taxCode ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.status ?? null,
      ]
    );
    const org = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        entitySchema: 'core',
        entityTable: 'organization',
        entityId: org.id,
        action: 'INSERT',
        after: org,
      },
      client
    );
    return org;
  });
}

/**
 * 조직 멤버 임기 종료(해임). 지우지 않고 valid_to 를 찍어 이력을 남긴다 —
 * "언제까지 누가 그 자리에 있었나"가 감사·분쟁에서 근거가 된다.
 */
export async function endMembership(
  memberId: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {},
  endOn?: string
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query(`SELECT * FROM core.org_member WHERE id=$1`, [memberId])).rows[0];
    if (!before) return;
    await client.query(
      `UPDATE core.org_member SET valid_to = COALESCE($2::date, CURRENT_DATE) WHERE id = $1 AND valid_to IS NULL`,
      [memberId, endOn ?? null]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'org_member', entityId: memberId,
        action: 'END_MEMBERSHIP', before, after: { valid_to: endOn ?? 'today' },
      },
      client
    );
  });
}

export interface OrgPatch {
  nameI18n?: I18nText;
  shortName?: string | null;
  regionCode?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string;   // ACTIVE / PENDING / SUSPENDED (CLOSED 는 통합으로만)
}

/**
 * 조직 정보 수정 (이름·연락처·상태 정정). 구조 변경(상위 이동·통합)은 별도 함수가 담당한다.
 * 읽고-합치고-쓰기로 넘어온 값만 바꾸고 변경 전/후를 감사기록에 남긴다.
 */
export async function updateOrganization(
  id: UUID,
  patch: OrgPatch,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<Organization> {
  return tx(async (client) => {
    const before = (
      await client.query<Organization>(`SELECT * FROM core.organization WHERE id=$1 AND deleted_at IS NULL`, [id])
    ).rows[0];
    if (!before) throw new Error('organization not found');
    const has = <K extends keyof OrgPatch>(k: K) => patch[k] !== undefined;
    const merged = {
      name_i18n: has('nameI18n') ? patch.nameI18n : before.name_i18n,
      short_name: has('shortName') ? patch.shortName : before.short_name,
      region_code: has('regionCode') ? patch.regionCode : before.region_code,
      tax_code: has('taxCode') ? patch.taxCode : before.tax_code,
      phone: has('phone') ? patch.phone : before.phone,
      email: has('email') ? patch.email : before.email,
      status: has('status') ? patch.status : before.status,
    };
    const res = await client.query<Organization>(
      `UPDATE core.organization
          SET name_i18n=$2::jsonb, short_name=$3, region_code=$4, tax_code=$5,
              phone=$6, email=$7, status=$8, updated_at=now()
        WHERE id=$1 RETURNING *`,
      [id, JSON.stringify(merged.name_i18n), merged.short_name, merged.region_code,
       merged.tax_code, merged.phone, merged.email, merged.status]
    );
    const after = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'organization', entityId: id,
        action: 'UPDATE', before, after,
      },
      client
    );
    return after;
  });
}

/**
 * 조직 비활성 (소프트 삭제). 지우지 않고 deleted_at 를 찍어 트리에서 감춘다.
 * 하위 조직이 남아 있으면 고아가 되므로 막는다(먼저 통합/이동해야 한다). 되살릴 수 있다.
 * 흡수(후속 조직 있음)는 mergeOrganization 을 쓴다 — 이건 후속 없는 폐지/중복 제거용.
 */
export async function deactivateOrganization(
  id: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query<Organization>(`SELECT * FROM core.organization WHERE id=$1`, [id])).rows[0];
    if (!before || before.deleted_at) return;
    const kids = (await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM core.organization WHERE parent_id=$1 AND deleted_at IS NULL`, [id]
    )).rows[0];
    if ((kids?.n ?? 0) > 0) throw new Error('ORG_HAS_CHILDREN');
    await client.query(
      `UPDATE core.organization SET deleted_at=now(), status='CLOSED', updated_at=now() WHERE id=$1`, [id]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'organization', entityId: id,
        action: 'DEACTIVATE', before, after: { status: 'CLOSED', deleted_at: 'now()' },
      },
      client
    );
  });
}

/** 비활성 되돌리기. */
export async function reactivateOrganization(
  id: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query<Organization>(`SELECT * FROM core.organization WHERE id=$1`, [id])).rows[0];
    if (!before || !before.deleted_at) return;
    await client.query(
      `UPDATE core.organization SET deleted_at=NULL, status='ACTIVE', updated_at=now() WHERE id=$1`, [id]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'organization', entityId: id,
        action: 'REACTIVATE', before, after: { status: 'ACTIVE', deleted_at: null },
      },
      client
    );
  });
}

/**
 * 조직 통합 (행정구역 개편 대응).
 * 옛 조직을 지우지 않고 effective_to를 닫은 뒤 merged_into_id로 연결한다.
 * 과거 대회 기록이 옛 조직을 참조하고 있으므로 절대 삭제하면 안 된다.
 */
export async function mergeOrganization(
  fromId: UUID,
  intoId: UUID,
  effectiveOn: string,
  actor: { personId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query(`SELECT * FROM core.organization WHERE id=$1`, [fromId]))
      .rows[0];
    await client.query(
      `UPDATE core.organization
          SET merged_into_id = $2, effective_to = $3, status = 'CLOSED', updated_at = now()
        WHERE id = $1`,
      [fromId, intoId, effectiveOn]
    );
    // 구 지역코드를 후속 조직에 누적 (과거 지명으로도 검색되게)
    await client.query(
      `UPDATE core.organization
          SET legacy_region_codes =
                (SELECT array_agg(DISTINCT x) FROM unnest(
                   COALESCE(legacy_region_codes,'{}') || COALESCE($2::text[],'{}')) AS x)
        WHERE id = $1`,
      [intoId, before?.region_code ? [before.region_code] : null]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId,
        entitySchema: 'core',
        entityTable: 'organization',
        entityId: fromId,
        action: 'MERGE',
        before,
        after: { merged_into_id: intoId, effective_to: effectiveOn },
        note: '행정구역 개편/조직 통합',
      },
      client
    );
  });
}

// ── 권한·담당자 관리 (RBAC) ────────────────────────────────────────────────
// 업무 담당자(문체부·성/시·연맹·클럽)를 조직별 역할로 배정/회수한다. 회수는 endMembership 사용.

const WORKSPACE_ROLE_CODES = ['SYS_ADMIN', 'GOV_ADMIN', 'ORG_HEAD', 'ORG_STAFF', 'ORG_FINANCE', 'ORG_MEDIA'];

export interface WorkspaceRole { code: string; name_i18n: I18nText; }

/** 배정 가능한 업무 역할 목록(드롭다운용). */
export async function listWorkspaceRoles(): Promise<WorkspaceRole[]> {
  return query<WorkspaceRole>(
    `SELECT code, name_i18n FROM core.role WHERE code = ANY($1)
      ORDER BY array_position($1::text[], code)`,
    [WORKSPACE_ROLE_CODES]
  );
}

export interface OperatorRow {
  member_id: UUID;
  person_id: UUID;
  full_name: string;
  org_id: UUID;
  org_name: I18nText;
  role_code: string;
  role_name: I18nText;
  title: string | null;
  valid_from: string;
}

/** 현재 유효한 업무 담당자(조직별 역할) 목록. */
export async function listOperators(filter: { orgId?: UUID | null; roleCode?: string | null } = {}): Promise<OperatorRow[]> {
  return query<OperatorRow>(
    `SELECT m.id AS member_id, m.person_id, p.full_name, m.org_id, o.name_i18n AS org_name,
            m.role_code, r.name_i18n AS role_name, m.title, m.valid_from::text AS valid_from
       FROM core.org_member m
       JOIN core.person p ON p.id = m.person_id
       JOIN core.organization o ON o.id = m.org_id
       JOIN core.role r ON r.code = m.role_code
      WHERE m.role_code = ANY($1)
        AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
        AND ($2::uuid IS NULL OR m.org_id = $2)
        AND ($3::text IS NULL OR m.role_code = $3)
      ORDER BY o.name_i18n->>'vi', p.full_name`,
    [WORKSPACE_ROLE_CODES, filter.orgId ?? null, filter.roleCode ?? null]
  );
}

export class AccessError extends Error {
  constructor(public code: string) { super(code); }
}

/** 담당자에게 조직 역할 부여. 이미 유효한 동일 배정이 있으면 그대로 둔다. */
export async function assignRole(
  input: { personId: UUID; orgId: UUID; roleCode: string; title?: string | null },
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<UUID> {
  if (!WORKSPACE_ROLE_CODES.includes(input.roleCode)) throw new AccessError('INVALID_ROLE');
  return tx(async (client) => {
    const existing = (await client.query<{ id: UUID }>(
      `SELECT id FROM core.org_member
        WHERE person_id=$1 AND org_id=$2 AND role_code=$3
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE) LIMIT 1`,
      [input.personId, input.orgId, input.roleCode]
    )).rows[0];
    if (existing) return existing.id;
    const row = (await client.query<{ id: UUID }>(
      `INSERT INTO core.org_member (person_id, org_id, role_code, title)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [input.personId, input.orgId, input.roleCode, input.title ?? null]
    )).rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId ?? input.orgId,
        entitySchema: 'core', entityTable: 'org_member', entityId: row.id,
        action: 'ASSIGN_ROLE',
        after: { person: input.personId, org: input.orgId, role: input.roleCode, title: input.title ?? null },
      },
      client
    );
    return row.id;
  });
}
