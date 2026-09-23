import { NextResponse } from 'next/server';
import {
  buildWorkbook, sheet, exportFileName, MONEY_FMT, i18nCell,
  listRegister, listAwards, listPaymentOrders, personImportTemplate, orgImportTemplate,
  type UUID,
} from '@vsp/core-admin';
import { listRegistrations, searchAthletes, listSquad } from '@vsp/sport-domain';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { workUserOrNull } from '@/lib/session';

/**
 * 엑셀 내보내기.
 *
 * 감사 제출과 정부 보고는 결국 엑셀로 오간다.
 * 화면에서 보는 것과 같은 자료를 같은 순서로 내보내야 담당자가 대조할 수 있다.
 *
 *   /api/export/register?type=PRODUCED   문서 대장
 *   /api/export/grants                   교부 내역
 *   /api/export/payments                 수납 내역
 *   /api/export/athletes                 선수 명단
 *   /api/export/registrations            등록 신청 내역
 *
 * 업무 자료이므로 업무 역할이 있는 사람만 받는다. 공시 자료(보조금 공시·단체 명부)는
 * 대외 웹사이트(apps/portal)에서 로그인 없이 받는다.
 */


/** 쪽수를 넘겨가며 모을 때의 상한. 20,000건이면 전국 선수 명단을 담고도 남는다. */
const EXPORT_PAGE_CAP = 200;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const { kind } = await params;
  const url = new URL(req.url);
  const raw = url.searchParams.get('locale') ?? 'vi';
  const locale: Locale = isLocale(raw) ? raw : 'vi';

  // 누구나 로그인할 수 있으므로 "로그인했는가"가 아니라 "업무 역할이 있는가"를 본다
  const user = await workUserOrNull();
  if (!user) return new NextResponse('Forbidden', { status: 403 });
  const orgId = (user.activeOrgId ?? null) as UUID | null;

  try {
    const built = await buildFor(kind, { locale, orgId, params: url.searchParams });
    if (!built) return new NextResponse('Unknown export', { status: 404 });

    const encoded = encodeURIComponent(built.fileName);
    return new NextResponse(new Uint8Array(built.buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Export failed', { status: 500 });
  }
}

async function buildFor(
  kind: string,
  ctx: { locale: Locale; orgId: UUID | null; params: URLSearchParams }
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const { locale, orgId, params } = ctx;

  if (kind === 'person-template') {
    return { buffer: await personImportTemplate(), fileName: 'mau_dang_ky_VDV.xlsx' };
  }

  if (kind === 'org-template') {
    return { buffer: await orgImportTemplate(), fileName: 'mau_dang_ky_don_vi.xlsx' };
  }

  if (kind === 'register') {
    if (!orgId) return null;
    const type = params.get('type') === 'RECEIVED' ? 'RECEIVED' : 'PRODUCED';
    const rows = await listRegister(orgId, type);
    const buffer = await buildWorkbook([
      sheet({
        name: type === 'PRODUCED' ? 'So van ban di' : 'So van ban den',
        title: type === 'PRODUCED' ? 'Sổ văn bản đi' : 'Sổ văn bản đến',
        subtitle: new Date().toISOString().slice(0, 10),
        columns: [
          { header: 'No.', value: (r) => r.register_no, width: 18 },
          { header: 'Số văn bản', value: (r) => r.doc_no, width: 20 },
          { header: 'Trích yếu', value: (r) => r.title, width: 48 },
          { header: 'Ngày', value: (r) => r.registered_at.slice(0, 10), width: 14 },
        ],
        rows,
      }),
    ]);
    return { buffer, fileName: exportFileName(`document_register_${type.toLowerCase()}`) };
  }

  if (kind === 'grants') {
    const rows = await listAwards(orgId ? { granteeOrgId: orgId } : {});
    const buffer = await buildWorkbook([
      sheet({
        name: 'Tro cap',
        title: 'Danh sách khoản trợ cấp',
        columns: [
          { header: 'Chương trình', value: (r) => i18nCell(r.program_name, locale), width: 34 },
          { header: 'Đơn vị', value: (r) => i18nCell(r.org_name, locale), width: 30 },
          { header: 'Số quyết định', value: (r) => r.decision_no ?? '', width: 18 },
          { header: 'Số tiền cấp', value: (r) => Number(r.awarded_amount), width: 18, numFmt: MONEY_FMT },
          { header: 'Đã chi', value: (r) => Number(r.executed_amount), width: 18, numFmt: MONEY_FMT },
          { header: 'Tỷ lệ (%)', value: (r) => r.execution_rate, width: 12 },
          { header: 'Hạn quyết toán', value: (r) => r.settlement_due_on ?? '', width: 16 },
          { header: 'Trạng thái', value: (r) => r.status, width: 14 },
        ],
        rows,
      }),
    ]);
    return { buffer, fileName: exportFileName('grants') };
  }

  if (kind === 'payments') {
    const rows = await listPaymentOrders({ payeeOrgId: orgId, limit: 5000 });
    const buffer = await buildWorkbook([
      sheet({
        name: 'Thu phi',
        title: 'Danh sách thu phí',
        columns: [
          { header: 'Đơn thu', value: (r) => r.order_no, width: 22 },
          { header: 'Người nộp', value: (r) => r.payer_name ?? '', width: 24 },
          { header: 'Đơn vị thụ hưởng', value: (r) => i18nCell(r.payee_name, locale), width: 30 },
          { header: 'Số tiền', value: (r) => Number(r.amount), width: 16, numFmt: MONEY_FMT },
          { header: 'Hình thức', value: (r) => r.method ?? '', width: 14 },
          { header: 'Trạng thái', value: (r) => r.status, width: 14 },
          { header: 'Ngày nộp', value: (r) => (r.paid_at ? r.paid_at.slice(0, 10) : ''), width: 14 },
        ],
        rows,
      }),
    ]);
    return { buffer, fileName: exportFileName('payments') };
  }

  if (kind === 'athletes') {
    // 검색 API 는 한 번에 100건까지만 준다 — 공개 검색을 통째로 긁어가지 못하게 한 제한이다.
    // 그 제한은 그대로 두고, 내보내기는 쪽수를 넘겨가며 모은다.
    // 화면에 100건만 담긴 파일이 나오면 담당자는 그게 전부인 줄 알고 보고에 쓴다.
    const filter = {
      sportId: (params.get('sport') as UUID) || null,
      regionCode: params.get('region'),
      gender: (params.get('gender') as 'M' | 'F') || null,
      name: params.get('q'),
      pageSize: 100,
    };
    const first = await searchAthletes({ ...filter, page: 1 });
    const res = { total: first.total, rows: first.rows.slice() };
    const maxPages = Math.min(Math.ceil(first.total / 100), EXPORT_PAGE_CAP);
    for (let page = 2; page <= maxPages; page += 1) {
      const next = await searchAthletes({ ...filter, page });
      if (next.rows.length === 0) break;
      res.rows.push(...next.rows);
    }
    const buffer = await buildWorkbook([
      sheet({
        name: 'VDV',
        title: 'Danh sách vận động viên',
        subtitle: `${res.total}`,
        columns: [
          { header: 'Họ tên', value: (r) => r.full_name, width: 26 },
          { header: 'Năm sinh', value: (r) => r.birth_year ?? '', width: 12 },
          { header: 'Giới tính', value: (r) => r.gender ?? '', width: 10 },
          { header: 'Tỉnh/Thành', value: (r) => r.region_code ?? '', width: 14 },
          { header: 'Môn', value: (r) => i18nCell(r.sport_name, locale), width: 20 },
          { header: 'Đơn vị', value: (r) => i18nCell(r.org_name, locale), width: 32 },
        ],
        rows: res.rows,
      }),
    ]);
    return { buffer, fileName: exportFileName('athletes') };
  }

  if (kind === 'national-team-entry') {
    const callupId = params.get('callup') as UUID | null;
    if (!callupId) return null;
    const squad = (await listSquad(callupId)).filter(
      (m) => m.member_status === 'CONFIRMED' && (m.squad_role === 'ATHLETE' || m.squad_role === 'RESERVE')
    );
    const buffer = await buildWorkbook([
      sheet({
        name: 'Entry',
        title: 'Danh sách đội tuyển · 국가대표 엔트리',
        subtitle: `${squad.length}`,
        columns: [
          { header: 'Họ tên', value: (r) => r.full_name, width: 26 },
          { header: 'Latin', value: (r) => r.name_latin ?? '', width: 24 },
          { header: 'Vai trò', value: (r) => r.squad_role, width: 12 },
          { header: 'Số áo', value: (r) => r.jersey_no ?? '', width: 8 },
        ],
        rows: squad,
      }),
    ]);
    return { buffer, fileName: exportFileName('national_team_entry') };
  }

  if (kind === 'registrations') {
    const rows = await listRegistrations({ orgId, limit: 5000 });
    const buffer = await buildWorkbook([
      sheet({
        name: 'Dang ky',
        title: 'Danh sách đăng ký',
        columns: [
          { header: 'Họ tên', value: (r) => r.full_name, width: 26 },
          { header: 'Loại', value: (r) => r.reg_type, width: 16 },
          { header: 'Môn', value: (r) => i18nCell(r.sport_name, locale), width: 20 },
          { header: 'Đơn vị', value: (r) => i18nCell(r.org_name, locale), width: 32 },
          { header: 'Năm sinh', value: (r) => (r.birth_date ? r.birth_date.slice(0, 4) : ''), width: 12 },
          { header: 'Trạng thái', value: (r) => r.status, width: 14 },
        ],
        rows,
      }),
    ]);
    return { buffer, fileName: exportFileName('registrations') };
  }

  return null;
}
