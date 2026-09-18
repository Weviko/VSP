import { NextResponse } from 'next/server';
import {
  buildWorkbook, sheet, exportFileName, MONEY_FMT, i18nCell, isLocale,
  listGrantDisclosures, listFederations, type Locale,
} from '@vsp/public-data';

/**
 * 공시 자료 엑셀 내려받기 (로그인 없음).
 *
 * 법으로 공개하게 되어 있는 자료만 여기서 내보낸다. 화면에서 누구나 보는 자료를
 * 내려받기만 로그인하게 하면 공시의 취지에 어긋나고, 기자와 후원사가 가장 먼저 막힌다.
 * 명단·수납·보조금 집행 같은 업무 자료는 업무 플랫폼에서 로그인한 담당자만 받는다.
 *
 *   /api/export/disclosure?year=2026   보조금 공시
 *   /api/export/orgs                   회원종목단체 명부 (경영공시)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const { kind } = await params;
  const url = new URL(req.url);
  const raw = url.searchParams.get('locale') ?? 'vi';
  const locale: Locale = isLocale(raw) ? raw : 'vi';

  try {
    const built = await buildFor(kind, locale, url.searchParams);
    if (!built) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(new Uint8Array(built.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(built.fileName)}`,
        // 공개 자료라도 개정되면 바로 반영되어야 한다
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    // 공개 종단점에서는 내부 오류 내용을 돌려주지 않는다
    return new NextResponse('Export failed', { status: 500 });
  }
}

async function buildFor(
  kind: string,
  locale: Locale,
  params: URLSearchParams
): Promise<{ buffer: Buffer; fileName: string } | null> {
  if (kind === 'disclosure') {
    const yearRaw = params.get('year');
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
    const rows = await listGrantDisclosures(year);
    const num = (r: (typeof rows)[number], k: string) =>
      Number((r.summary as Record<string, string>)[k] ?? 0);
    const buffer = await buildWorkbook([
      sheet({
        name: 'Cong khai',
        title: 'Công khai trợ cấp',
        subtitle: year ? String(year) : '',
        columns: [
          { header: 'Năm', value: (r) => r.fiscal_year, width: 10 },
          { header: 'Đơn vị', value: (r) => i18nCell(r.org_name, locale), width: 32 },
          { header: 'Chương trình', value: (r) => i18nCell(r.program_name, locale), width: 34 },
          { header: 'Số tiền cấp', value: (r) => num(r, 'awarded'), width: 18, numFmt: MONEY_FMT },
          { header: 'Đã chi', value: (r) => num(r, 'executed'), width: 18, numFmt: MONEY_FMT },
          { header: 'Hoàn trả', value: (r) => num(r, 'returned'), width: 18, numFmt: MONEY_FMT },
          {
            header: 'Kết quả',
            value: (r) => String((r.summary as Record<string, string>).result ?? ''),
            width: 14,
          },
        ],
        rows,
      }),
    ]);
    return { buffer, fileName: exportFileName('grant_disclosure') };
  }

  if (kind === 'orgs') {
    // 경영공시 화면과 같은 항목·같은 순서. 대조할 수 없으면 공시 자료로 쓸모가 없다.
    const rows = await listFederations();
    const buffer = await buildWorkbook([
      sheet({
        name: 'Lien doan',
        title: 'Danh bạ liên đoàn thể thao quốc gia',
        subtitle: `${rows.length}`,
        columns: [
          { header: 'Tên đơn vị', value: (r) => i18nCell(r.name_i18n, locale), width: 34 },
          { header: 'Mã', value: (r) => r.display_id ?? '', width: 14 },
          { header: 'Năm thành lập', value: (r) => (r.established_at ? r.established_at.slice(0, 4) : ''), width: 14 },
          { header: 'Ngày gia nhập', value: (r) => r.effective_from.slice(0, 10), width: 14 },
          { header: 'Điện thoại', value: (r) => r.phone ?? '', width: 16 },
          { header: 'Email', value: (r) => r.email ?? '', width: 26 },
          { header: 'Website', value: (r) => r.website ?? '', width: 26 },
          { header: 'Địa chỉ', value: (r) => r.address ?? '', width: 40 },
          { header: 'Số thành viên', value: (r) => r.member_count, width: 14 },
        ],
        rows,
      }),
    ]);
    return { buffer, fileName: exportFileName('federations') };
  }

  return null;
}
