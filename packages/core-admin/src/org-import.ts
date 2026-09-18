/**
 * 조직 일괄 등록 — 온보딩용 (문서: 운영 방식 · 데이터 이관).
 *
 * MCST 공식 조직 목록을 엑셀로 올리면 → 검증(필수·형식·중복·상위참조) → 미리보기 → 사람이 확정 등록.
 * 조직은 트리라서 상위 조직을 **display_id(정의된 코드)** 로 참조한다.
 *   - 상위가 같은 파일 안에 있으면(한 번에 조직도 전체 업로드) 그 코드로,
 *   - 이미 시스템에 있으면 DB 의 그 코드로 연결한다.
 * 확정 시 상위 → 하위 순서로 넣는다(위상 정렬). 참조가 꼬이면 그 행만 건너뛴다.
 *
 * 원칙(사람 명단 일괄 등록과 같다): 기계는 검증·초안만, 사람이 확정한다.
 * 사람 명단 일괄 등록은 [[bulk-import]] 참고 — 같은 흐름(템플릿→검증→미리보기→확정)이다.
 */
import { query, tx } from './db';
import { readAttachment } from './storage';
import { buildWorkbook, sheet } from './export';
import { writeAudit } from './audit';
import type { UUID } from './types';

/** 템플릿·업로드 공통 컬럼 순서(계약). 헤더 텍스트가 아니라 순서로 읽는다. */
export const ORG_IMPORT_COLUMNS = [
  { key: 'display_id', header: 'Mã đơn vị (*)', width: 16 },
  { key: 'name_vi', header: 'Tên đơn vị (*)', width: 30 },
  { key: 'name_en', header: 'Tên tiếng Anh', width: 26 },
  { key: 'name_ko', header: 'Tên tiếng Hàn', width: 20 },
  { key: 'level_type', header: 'Loại cấp (*)', width: 16 },
  { key: 'parent_display_id', header: 'Mã đơn vị cấp trên', width: 18 },
  { key: 'region_code', header: 'Mã vùng', width: 12 },
  { key: 'short_name', header: 'Tên viết tắt', width: 16 },
  { key: 'phone', header: 'Điện thoại', width: 16 },
  { key: 'email', header: 'Email', width: 22 },
] as const;

export interface OrgRawRow {
  row: number; // 엑셀 행 번호(사람이 찾기 쉽게)
  display_id: string;
  name_vi: string;
  name_en: string;
  name_ko: string;
  level_type: string;
  parent_display_id: string;
  region_code: string;
  short_name: string;
  phone: string;
  email: string;
}

/** 빈 조직 템플릿(엑셀). 헤더 + 예시 2행(상위·하위로 참조 방식을 보여준다). */
export async function orgImportTemplate(): Promise<Buffer> {
  return buildWorkbook([
    sheet<Record<string, string>>({
      name: 'Đơn vị',
      title: 'Mẫu đăng ký hàng loạt đơn vị — điền từ dòng dưới header',
      subtitle: 'Bắt buộc: Mã đơn vị · Tên · Loại cấp. Cấp trên tham chiếu bằng "Mã đơn vị cấp trên".',
      columns: ORG_IMPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width, value: (r) => r[c.key] ?? '' })),
      rows: [
        { display_id: 'FED-TKD', name_vi: 'Liên đoàn Taekwondo Việt Nam', name_en: 'Vietnam Taekwondo Federation', name_ko: '베트남 태권도연맹', level_type: 'NATIONAL_FED', parent_display_id: '', region_code: '', short_name: 'VTF', phone: '', email: '' },
        { display_id: 'TKD-HN', name_vi: 'Liên đoàn Taekwondo Hà Nội', name_en: '', name_ko: '하노이 태권도연맹', level_type: 'PROVINCE_FED', parent_display_id: 'FED-TKD', region_code: 'HN', short_name: '', phone: '', email: '(ví dụ — xóa 2 dòng này)' },
      ],
    }),
  ]);
}

function cellStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text).trim();
  return String(v).trim();
}

/** 업로드된 엑셀을 행 배열로 파싱한다(첫 시트, 헤더 자동 감지). */
export async function parseOrgWorkbook(buffer: Buffer): Promise<OrgRawRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  // 헤더 행 찾기: 첫 셀에 'mã'/'code'/'코드'/'display' 가 있는 행. 없으면 1행.
  let headerRow = 1;
  ws.eachRow((r, n) => {
    const first = cellStr(r.getCell(1).value).toLowerCase();
    if (/mã|code|코드|display|đơn vị/.test(first)) headerRow = Math.max(headerRow, n);
  });
  const out: OrgRawRow[] = [];
  ws.eachRow((r, n) => {
    if (n <= headerRow) return;
    const get = (i: number) => cellStr(r.getCell(i).value);
    const row: OrgRawRow = {
      row: n,
      display_id: get(1), name_vi: get(2), name_en: get(3), name_ko: get(4),
      level_type: get(5), parent_display_id: get(6), region_code: get(7),
      short_name: get(8), phone: get(9), email: get(10),
    };
    if (Object.values(row).some((v, i) => i > 0 && v !== '')) out.push(row);
  });
  return out;
}

export interface OrgValidatedRow {
  row: number;
  display_id: string;
  name_vi: string;
  name_en: string | null;
  name_ko: string | null;
  level_type: string;
  parent_display_id: string | null;
  region_code: string | null;
  short_name: string | null;
  phone: string | null;
  email: string | null;
  // 오류 코드: REQUIRED_ID / REQUIRED_NAME / BAD_LEVEL / DUP_FILE / DUP_DB / BAD_PARENT
  errors: string[];
  ok: boolean;
}

export interface OrgValidationResult {
  rows: OrgValidatedRow[];
  total: number;
  valid: number;
  errors: number;
}

/** 검증: 필수·유효 레벨·중복(파일+DB)·상위참조. 아무것도 저장하지 않는다. */
export async function validateOrgRows(rows: OrgRawRow[]): Promise<OrgValidationResult> {
  // 유효한 레벨 코드 집합
  const levels = new Set(
    (await query<{ code: string }>(`SELECT code FROM core.org_level_type`)).map((r) => r.code)
  );

  // 파일에 등장하는 display_id / 상위 display_id 를 모아 DB 존재 여부를 한 번에 조회
  const referenced = Array.from(
    new Set(
      [...rows.map((r) => r.display_id.trim()), ...rows.map((r) => r.parent_display_id.trim())]
        .filter((s) => s !== '')
    )
  );
  const dbDisplayIds = new Set<string>();
  if (referenced.length) {
    const found = await query<{ display_id: string }>(
      `SELECT display_id FROM core.organization
        WHERE display_id = ANY($1) AND deleted_at IS NULL AND display_id IS NOT NULL`,
      [referenced]
    );
    for (const f of found) dbDisplayIds.add(f.display_id);
  }

  // 파일 안의 display_id 집합(상위 참조가 같은 파일 안에 있는지 확인용)
  const fileIds = new Set(rows.map((r) => r.display_id.trim()).filter(Boolean));
  const seen = new Set<string>();

  const out: OrgValidatedRow[] = rows.map((r) => {
    const errors: string[] = [];
    const displayId = r.display_id.trim();
    const parent = r.parent_display_id.trim();
    const level = r.level_type.trim();

    if (!displayId) errors.push('REQUIRED_ID');
    if (!r.name_vi.trim()) errors.push('REQUIRED_NAME');
    if (!level || !levels.has(level)) errors.push('BAD_LEVEL');

    if (displayId) {
      if (seen.has(displayId)) errors.push('DUP_FILE');
      else seen.add(displayId);
      if (dbDisplayIds.has(displayId)) errors.push('DUP_DB');
    }
    // 상위가 지정됐는데 파일에도 DB에도 없으면 연결할 수 없다
    if (parent && !fileIds.has(parent) && !dbDisplayIds.has(parent)) errors.push('BAD_PARENT');

    return {
      row: r.row,
      display_id: displayId,
      name_vi: r.name_vi.trim(),
      name_en: r.name_en.trim() || null,
      name_ko: r.name_ko.trim() || null,
      level_type: level,
      parent_display_id: parent || null,
      region_code: r.region_code.trim() || null,
      short_name: r.short_name.trim() || null,
      phone: r.phone.trim() || null,
      email: r.email.trim() || null,
      errors,
      ok: errors.length === 0,
    };
  });

  return { rows: out, total: out.length, valid: out.filter((r) => r.ok).length, errors: out.filter((r) => !r.ok).length };
}

/**
 * 확정 등록 — 검증을 통과한 행만 조직으로 넣는다(한 트랜잭션).
 * 상위 → 하위 순서(위상 정렬)로 넣어, 같은 파일 안에서 상위를 참조하는 하위도 연결된다.
 * 상위가 끝내 준비되지 않는 행(순환 참조 등)은 그 행만 건너뛴다.
 */
export async function commitOrgImport(
  attachmentId: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null }
): Promise<{ inserted: number; skipped: number; batch: string }> {
  const file = await readAttachment(attachmentId);
  if (!file) throw new Error('attachment not found');
  const rows = await parseOrgWorkbook(file.data);
  const v = await validateOrgRows(rows);
  const batch = `orgimport:${Date.now()}`;

  // 상위 참조 해소용: 이미 DB에 있는 display_id → id (부모로만 쓰인다)
  const parents = v.rows
    .map((r) => r.parent_display_id)
    .filter((p): p is string => Boolean(p));
  const dbParentId = new Map<string, UUID>();
  if (parents.length) {
    const found = await query<{ id: UUID; display_id: string }>(
      `SELECT id, display_id FROM core.organization
        WHERE display_id = ANY($1) AND deleted_at IS NULL`,
      [parents]
    );
    for (const f of found) dbParentId.set(f.display_id, f.id);
  }

  const result = await tx(async (client) => {
    const created = new Map<string, UUID>(); // 이번에 새로 넣은 display_id → id
    const pending = v.rows.filter((r) => r.ok);
    let inserted = 0;

    // 위상 정렬: 상위가 (없거나 · DB에 있거나 · 이번에 이미 넣었으면) 삽입 가능
    let progressed = true;
    while (pending.length && progressed) {
      progressed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const r = pending[i];
        const p = r.parent_display_id;
        const parentReady = !p || dbParentId.has(p) || created.has(p);
        if (!parentReady) continue;
        const parentId = p ? (created.get(p) ?? dbParentId.get(p) ?? null) : null;

        const ins = await client.query<{ id: UUID }>(
          `INSERT INTO core.organization
             (parent_id, level_type, name_i18n, display_id, short_name,
              region_code, phone, email, status, external_ids)
           VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,'ACTIVE', jsonb_build_object('import',$9::text))
           RETURNING id`,
          [
            parentId, r.level_type,
            JSON.stringify({ vi: r.name_vi, en: r.name_en ?? undefined, ko: r.name_ko ?? undefined }),
            r.display_id, r.short_name, r.region_code, r.phone, r.email, batch,
          ]
        );
        created.set(r.display_id, ins.rows[0].id);
        inserted += 1;
        pending.splice(i, 1);
        progressed = true;
      }
    }
    return inserted;
  });

  await writeAudit({
    actorPersonId: actor.personId ?? null, actorOrgId: actor.orgId ?? null,
    entitySchema: 'core', entityTable: 'organization',
    entityId: attachmentId, action: 'BULK_IMPORT', after: { batch, inserted: result, total: v.total },
  });
  return { inserted: result, skipped: v.total - result, batch };
}

/** 미리보기용: 첨부를 읽어 검증 결과만 돌려준다(저장 없음). */
export async function validateOrgImportAttachment(attachmentId: UUID): Promise<OrgValidationResult> {
  const file = await readAttachment(attachmentId);
  if (!file) throw new Error('attachment not found');
  const rows = await parseOrgWorkbook(file.data);
  return validateOrgRows(rows);
}
