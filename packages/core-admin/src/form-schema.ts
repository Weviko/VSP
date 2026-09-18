/**
 * 동적 폼 스키마 (순수 로직).
 *
 * 이 파일은 DB에 의존하지 않는다. 브라우저 번들에 안전하게 들어갈 수 있어야
 * 폼 렌더러가 같은 검증 규칙을 공유할 수 있기 때문이다.
 * DB 접근은 form.ts에 있다.
 *
 *
 * 존재 이유: 베트남 체육회의 공식 서식을 아직 받지 못한 상태에서 개발을 시작했다.
 * 서식이 나중에 어떤 모양으로 오더라도 코드를 고치지 않고 수용해야 한다.
 * 따라서 신청서의 필드·검증·조건부 표시를 전부 DB에 두고 런타임에 해석한다.
 */
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect'
  | 'checkbox' | 'file' | 'person' | 'org' | 'table';

export interface FormFieldOption {
  value: string;
  label_i18n: I18nText;
}

export interface FormField {
  id: UUID;
  form_id: UUID;
  field_key: string;
  label_i18n: I18nText;
  help_i18n: I18nText | null;
  data_type: FieldType;
  is_required: boolean;
  options: FormFieldOption[] | null;
  validation: FieldValidation | null;
  visible_when: VisibleWhen | null;
  default_value: unknown;
  bind_to: string | null;
  section: string | null;
  sort_order: number;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string;
  /** 첨부 허용 확장자 */
  accept?: string[];
  maxSizeMb?: number;
}

/** 조건부 표시: 다른 필드 값에 따라 이 필드를 보이거나 숨긴다 */
export interface VisibleWhen {
  field: string;
  eq?: unknown;
  ne?: unknown;
  in?: unknown[];
}

export interface FormDefinition {
  id: UUID;
  code: string;
  version: number;
  org_id: UUID | null;
  sport_id: UUID | null;
  title_i18n: I18nText;
  description_i18n: I18nText | null;
  legal_basis: string | null;
  sla_days: number | null;
  layout: Record<string, unknown>;
  status: string;
}

export interface FormWithFields extends FormDefinition {
  fields: FormField[];
}

export interface ValidationError {
  field: string;
  code: 'REQUIRED' | 'MIN' | 'MAX' | 'MIN_LENGTH' | 'MAX_LENGTH' | 'PATTERN' | 'TYPE' | 'FILE';
}

/** 조건부 표시 규칙을 평가한다. 숨겨진 필드는 필수 검증에서 제외한다. */
export function isFieldVisible(field: FormField, data: Record<string, unknown>): boolean {
  const w = field.visible_when;
  if (!w) return true;
  const v = data[w.field];
  if (w.eq !== undefined) return v === w.eq;
  if (w.ne !== undefined) return v !== w.ne;
  if (w.in !== undefined) return Array.isArray(w.in) && w.in.includes(v);
  return true;
}

/**
 * 제출 데이터 검증.
 * 서버에서 반드시 다시 검증한다 (클라이언트 검증만 믿지 않는다).
 */
/** 첨부 필드의 값 — 업로드가 끝난 뒤 화면이 담아 보내는 모양 */
export interface FileValue {
  id: string;
  name: string;
  size?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFileValue(v: unknown): v is FileValue {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && UUID_RE.test(o.id) && typeof o.name === 'string';
}

/**
 * 제출 데이터에서 첨부 id 를 뽑는다.
 *
 * 화면이 따로 보내온 목록을 믿지 않고 서식 정의에 있는 첨부 필드만 훑는다.
 * 목록을 받아 쓰면 남의 첨부 id 를 끼워 넣어 내 신청서에 끌어올 수 있다.
 */
export function attachmentIdsIn(
  form: FormWithFields,
  data: Record<string, unknown>
): string[] {
  const out: string[] = [];
  for (const f of form.fields) {
    if (f.data_type !== 'file') continue;
    const v = data[f.field_key];
    if (isFileValue(v)) out.push(v.id);
  }
  return out;
}

export function validateSubmission(
  form: FormWithFields,
  data: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const f of form.fields) {
    if (!isFieldVisible(f, data)) continue;

    const raw = data[f.field_key];
    const empty = raw === undefined || raw === null || raw === '' ||
      (Array.isArray(raw) && raw.length === 0);

    if (f.is_required && empty) {
      errors.push({ field: f.field_key, code: 'REQUIRED' });
      continue;
    }
    if (empty) continue;

    // 첨부는 값이 {id, name} 꼴이어야 한다. 파일명 문자열만 들어오면 실제로는 아무것도 올라가지 않은 것이다.
    if (f.data_type === 'file') {
      if (!isFileValue(raw)) errors.push({ field: f.field_key, code: 'FILE' });
      continue;
    }

    const v = f.validation;
    if (!v) continue;

    if (f.data_type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) errors.push({ field: f.field_key, code: 'TYPE' });
      else {
        if (v.min !== undefined && n < v.min) errors.push({ field: f.field_key, code: 'MIN' });
        if (v.max !== undefined && n > v.max) errors.push({ field: f.field_key, code: 'MAX' });
      }
    } else if (typeof raw === 'string') {
      if (v.minLength !== undefined && raw.length < v.minLength)
        errors.push({ field: f.field_key, code: 'MIN_LENGTH' });
      if (v.maxLength !== undefined && raw.length > v.maxLength)
        errors.push({ field: f.field_key, code: 'MAX_LENGTH' });
      if (v.regex && !new RegExp(v.regex).test(raw))
        errors.push({ field: f.field_key, code: 'PATTERN' });
    }
  }
  return errors;
}

