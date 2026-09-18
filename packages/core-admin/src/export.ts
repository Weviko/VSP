/**
 * 엑셀 내보내기.
 *
 * 이게 없으면 실무가 돌지 않는다. 문서 대장과 정산 자료는 감사에 제출해야 하고,
 * 정부 보고서는 결국 엑셀로 오간다. 협회 담당자도 명단을 엑셀로 받아 확인한다.
 *
 * 베트남어·한국어가 섞이므로 시트 전체를 UTF-8 로 다루고,
 * 금액은 문자열이 아니라 숫자로 넣어 수식이 걸리게 한다.
 */
import type { I18nText, Locale } from './i18n';
import { t as pick } from './i18n';

export interface Column<T> {
  /** 머리글 */
  header: string;
  /** 행에서 값을 뽑는 방법 */
  value: (row: T) => string | number | null;
  width?: number;
  /** 숫자 서식 — 금액은 천단위 구분 */
  numFmt?: string;
}

export interface SheetSpec<T> {
  name: string;
  columns: Array<Column<T>>;
  rows: T[];
  /** 제목 줄. 보고서는 표 위에 무엇에 대한 자료인지 적혀 있어야 한다. */
  title?: string;
  subtitle?: string;
}

/** 시트 이름에 쓸 수 없는 문자를 정리한다 (엑셀이 파일을 못 열게 된다) */
function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet';
}

/**
 * 시트 하나를 타입 추론이 되는 채로 감싼다.
 * 이걸 거치지 않으면 여러 시트를 한 배열에 담을 때 행 타입이 사라져
 * 컬럼 콜백의 인자가 any 가 된다.
 */
export function sheet<T>(spec: SheetSpec<T>): SheetSpec<unknown> {
  return spec as unknown as SheetSpec<unknown>;
}

/**
 * 엑셀 파일 생성.
 * 여러 시트를 한 파일에 담을 수 있다 (예: 생산대장 + 접수대장).
 */
export async function buildWorkbook(sheets: Array<SheetSpec<unknown>>): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VSP';
  wb.created = new Date();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(safeSheetName(spec.name));
    let r = 1;

    if (spec.title) {
      const cell = ws.getCell(r, 1);
      cell.value = spec.title;
      cell.font = { bold: true, size: 14 };
      ws.mergeCells(r, 1, r, Math.max(1, spec.columns.length));
      r += 1;
    }
    if (spec.subtitle) {
      const cell = ws.getCell(r, 1);
      cell.value = spec.subtitle;
      cell.font = { size: 10, color: { argb: 'FF667085' } };
      ws.mergeCells(r, 1, r, Math.max(1, spec.columns.length));
      r += 1;
    }
    if (spec.title || spec.subtitle) r += 1;

    const headerRow = r;
    spec.columns.forEach((col, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = col.header;
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF1F5' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFC3CEDA' } } };
      cell.alignment = { vertical: 'middle' };
      ws.getColumn(i + 1).width = col.width ?? 18;
    });
    r += 1;

    for (const row of spec.rows) {
      spec.columns.forEach((col, i) => {
        const cell = ws.getCell(r, i + 1);
        const v = col.value(row);
        cell.value = v;
        if (col.numFmt) cell.numFmt = col.numFmt;
        cell.alignment = { vertical: 'top', wrapText: false };
      });
      r += 1;
    }

    // 머리글 고정 — 행이 많은 명단에서 스크롤할 때 필요하다
    ws.views = [{ state: 'frozen', ySplit: headerRow }];
    if (spec.rows.length > 0) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: spec.columns.length },
      };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** 금액 서식 — 베트남 동은 소수 단위를 쓰지 않는다 */
export const MONEY_FMT = '#,##0';

/** 다국어 값을 엑셀 셀에 넣을 때 쓰는 도우미 */
export function i18nCell(v: I18nText | null | undefined, locale: Locale): string {
  return v ? pick(v, locale) : '';
}

/** 다운로드 파일명. 날짜를 붙여 여러 번 받아도 구분되게 한다. */
export function exportFileName(base: string): string {
  const d = new Date();
  const stamp =
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`;
  return `${base}_${stamp}.xlsx`;
}
