import type { I18nText } from './i18n';

export type UUID = string;

export type OrgStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'CLOSED';

export interface Organization {
  id: UUID;
  display_id: string | null;
  parent_id: UUID | null;
  level_type: string;
  name_i18n: I18nText;
  short_name: string | null;
  logo_url: string | null;
  tax_code: string | null;
  established_at: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  region_code: string | null;
  legacy_region_codes: string[] | null;
  effective_from: string;
  effective_to: string | null;
  merged_into_id: UUID | null;
  external_ids: Record<string, unknown>;
  settings: Record<string, unknown>;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrgLevelType {
  code: string;
  name_i18n: I18nText;
  sort_order: number;
  description: string | null;
}

export interface Person {
  id: UUID;
  display_id: string | null;
  full_name: string;
  family_name: string | null;
  middle_name: string | null;
  given_name: string | null;
  name_latin: string | null;
  gender: 'M' | 'F' | 'X' | null;
  birth_date: string | null;
  nationality: string | null;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  external_ids: Record<string, unknown>;
  status: string;
}

export type RoleCode =
  | 'SYS_ADMIN'
  | 'GOV_ADMIN'
  | 'ORG_HEAD'
  | 'ORG_STAFF'
  | 'ORG_FINANCE'
  | 'ORG_MEDIA'
  | 'COACH'
  | 'MEMBER';

export interface OrgMember {
  id: UUID;
  person_id: UUID;
  org_id: UUID;
  role_code: RoleCode;
  title: string | null;
  valid_from: string;
  valid_to: string | null;
}

/** 조직 트리 노드 (화면 표시용) */
export interface OrgTreeNode extends Organization {
  depth: number;
  children: OrgTreeNode[];
}

/** 감사 로그 기록 입력 */
export interface AuditInput {
  actorPersonId?: UUID | null;
  actorOrgId?: UUID | null;
  actorIp?: string | null;
  entitySchema: string;
  entityTable: string;
  entityId?: UUID | null;
  action: string;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}
