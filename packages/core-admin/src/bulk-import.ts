/**
 * 엑셀 일괄 등록 — 온보딩용 (문서: 운영 방식 · 데이터 이관).
 *
 * 협회가 선수 명단을 엑셀로 올리면 → 검증(필수·형식·중복) → 미리보기 → 사람이 확정 등록.
 * 원칙(AI 등록과 같다): 기계는 검증·초안만, 사람이 확정한다. 중복은 CCCD 해시로 잡는다(원문 저장 안 함).
 * 템플릿을 내려받아 채우게 해서 컬럼이 어긋나지 않게 한다.
 */
import { createHash } from 'node:crypto';
import { query, tx } from './db';
import { readAttachment } from './storage';
import { buildWorkbook, sheet } from './export';
import { writeAudit } from './audit';
import type { UUID } from './types';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** 템플릿·업로드 공통 컬럼 순서(계약). 헤더 텍스트가 아니라 순서로 읽는다. */
export const IMPORT_COLUMNS = [
  { key: 'full_name', header: 'Họ và tên (*)', width: 24 },
  { key: 'name_latin', header: 'Tên Latin', width: 20 },
  { key: 'gender', header: 'Giới tính (M/F)', width: 12 },
  { key: 'birth_date', header: 'Ngày sinh (YYYY-MM-DD)', width: 18 },
  { key: 'phone', header: 'Số điện thoại', width: 16 },
  { key: 'cccd', header: 'Số CCCD', width: 16 },
  { key: 'note', header: 'Ghi chú', width: 20 },
] as const;

export interface RawRow {
  row: number; // 엑셀 행 번호(사람이 찾기 쉽게)
  full_name: string;
  name_latin: string;
  gender: string;
  birth_date: string;
  phone: string;
  cccd: string;
  note: string;
}

/** 빈 명단 템플릿(엑셀). 헤더 + 예시 1행. */
export async function personImportTemplate(): Promise<Buffer> {
  return buildWorkbook([
    sheet<Record<string, string>>({
      name: 'VĐV',
      title: 'Mẫu đăng ký hàng loạt VĐV — điền từ dòng dưới header',
      subtitle: 'Bắt buộc: Họ và tên. Trùng lặp phát hiện bằng số CCCD.',
      columns: IMPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width, value: (r) => r[c.key] ?? '' })),
      rows: [{ full_name: 'Nguyễn Văn A', name_latin: 'Nguyen Van A', gender: 'M', birth_date: '2001-05-12', phone: '0912345678', cccd: '', note: '(ví dụ — xóa dòng này)' }],
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
export async function parsePersonWorkbook(buffer: Buffer): Promise<RawRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  // 헤더 행 찾기: 첫 셀에 'Họ'/'full'/'성명' 이 있는 행. 없으면 1행.
  let headerRow = 1;
  ws.eachRow((r, n) => {
    const first = cellStr(r.getCell(1).value).toLowerCase();
    if (/họ|full|성명|name/.test(first)) headerRow = Math.max(headerRow, n);
  });
  const out: RawRow[] = [];
  ws.eachRow((r, n) => {
    if (n <= headerRow) return;
    const get = (i: number) => cellStr(r.getCell(i).value);
    const row: RawRow = {
      row: n,
      full_name: get(1), name_latin: get(2), gender: get(3),
      birth_date: get(4), phone: get(5), cccd: get(6), note: get(7),
    };
    if (Object.values(row).some((v, i) => i > 0 && v !== '')) out.push(row);
  });
  return out;
}

export interface ValidatedRow {
  row: number;
  full_name: string;
  name_latin: string | null;
  gender: string | null;
  birth_date: string | null;
  phone: string | null;
  cccd_hash: string | null;
  errors: string[];   // 오류 코드(REQUIRED_NAME / BAD_GENDER / BAD_DATE / DUP_FILE / DUP_DB)
  ok: boolean;
}

export interface ValidationResult {
  rows: ValidatedRow[];
  total: number;
  valid: number;
  errors: number;
}

function normGender(g: string): string | null {
  const t = g.trim().toLowerCase();
  if (['m', 'nam', '남', 'male'].includes(t)) return 'M';
  if (['f', 'nữ', 'nu', '여', 'female'].includes(t)) return 'F';
  if (['x', 'khác', 'khac', '기타', 'other'].includes(t)) return 'X';
  return g === '' ? null : 'INVALID';
}

function normDate(d: string): string | null | 'INVALID' {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return 'INVALID';
}

/** 검증: 필수·형식·중복(파일 내 + DB). 아무것도 저장하지 않는다. */
export async function validatePersonRows(rows: RawRow[]): Promise<ValidationResult> {
  const seenHash = new Set<string>();
  // DB 에 이미 있는 CCCD 해시 미리 조회
  const hashes = rows.map((r) => (r.cccd ? sha256(r.cccd.trim()) : null)).filter((h): h is string => Boolean(h));
  const existing = new Set<string>();
  if (hashes.length) {
    const found = await query<{ h: string }>(
      `SELECT id_doc_hash AS h FROM core.person WHERE id_doc_hash = ANY($1) AND deleted_at IS NULL`,
      [hashes]
    );
    for (const f of found) existing.add(f.h);
  }

  const out: ValidatedRow[] = rows.map((r) => {
    const errors: string[] = [];
    if (!r.full_name.trim()) errors.push('REQUIRED_NAME');
    const gender = normGender(r.gender);
    if (gender === 'INVALID') errors.push('BAD_GENDER');
    const birth = normDate(r.birth_date);
    if (birth === 'INVALID') errors.push('BAD_DATE');
    const cccd_hash = r.cccd.trim() ? sha256(r.cccd.trim()) : null;
    if (cccd_hash) {
      if (seenHash.has(cccd_hash)) errors.push('DUP_FILE');
      else seenHash.add(cccd_hash);
      if (existing.has(cccd_hash)) errors.push('DUP_DB');
    }
    return {
      row: r.row, full_name: r.full_name.trim(),
      name_latin: r.name_latin.trim() || null,
      gender: gender === 'INVALID' ? null : gender,
      birth_date: birth === 'INVALID' ? null : birth,
      phone: r.phone.trim() || null,
      cccd_hash,
      errors, ok: errors.length === 0,
    };
  });
  return { rows: out, total: out.length, valid: out.filter((r) => r.ok).length, errors: out.filter((r) => !r.ok).length };
}

/** 확정 등록 — 검증을 통과한 행만 사람으로 넣는다(한 트랜잭션). 첨부에서 다시 읽어 검증→삽입. */
export async function commitPersonImport(
  attachmentId: UUID,
  actor: { personId?: UUID | null }
): Promise<{ inserted: number; skipped: number; batch: string }> {
  const file = await readAttachment(attachmentId);
  if (!file) throw new Error('attachment not found');
  const rows = await parsePersonWorkbook(file.data);
  const v = await validatePersonRows(rows);
  const batch = `import:${Date.now()}`;

  const inserted = await tx(async (client) => {
    let n = 0;
    for (const r of v.rows) {
      if (!r.ok) continue;
      await client.query(
        `INSERT INTO core.person (full_name, name_latin, gender, birth_date, phone,
                                  id_doc_type, id_doc_hash, external_ids)
         VALUES ($1,$2,$3,$4::date,$5, CASE WHEN $6::text IS NULL THEN NULL ELSE 'CCCD' END, $6::text,
                 jsonb_build_object('import', $7::text))`,
        [r.full_name, r.name_latin, r.gender, r.birth_date, r.phone, r.cccd_hash, batch]
      );
      n += 1;
    }
    return n;
  });
  await writeAudit({
    actorPersonId: actor.personId ?? null, entitySchema: 'core', entityTable: 'person',
    entityId: attachmentId, action: 'BULK_IMPORT', after: { batch, inserted, total: v.total },
  });
  return { inserted, skipped: v.total - inserted, batch };
}

/** 미리보기용: 첨부를 읽어 검증 결과만 돌려준다(저장 없음). */
export async function validateImportAttachment(attachmentId: UUID): Promise<ValidationResult> {
  const file = await readAttachment(attachmentId);
  if (!file) throw new Error('attachment not found');
  const rows = await parsePersonWorkbook(file.data);
  return validatePersonRows(rows);
}
