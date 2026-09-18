import { NextResponse } from 'next/server';
import { readAttachment, canReadAttachment, getMyOrgIds, type UUID } from '@vsp/core-admin';
import { currentUser } from '@/lib/session';

/**
 * 첨부 다운로드.
 *
 * 등록 서류에는 신분증·건강진단서가 붙는다. 전국 협회 담당자가 모두 같은 시스템에
 * 로그인하므로 "로그인했으면 받을 수 있다"는 사실상 전국 공개와 같다.
 * 그 서류를 볼 자격이 있는 사람인지까지 확인한다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const { attachmentId } = await params;
  const { user } = await currentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const orgIds = await getMyOrgIds(user.personId);
  const allowed = await canReadAttachment(attachmentId as UUID, {
    personId: user.personId,
    orgIds,
    roleCodes: user.roleCodes,
  }).catch(() => false);
  // 권한이 없을 때도 404 로 답한다. 403 을 주면 그 id 의 첨부가 존재한다는 사실이 새어 나간다.
  if (!allowed) return new NextResponse('Not found', { status: 404 });

  const file = await readAttachment(attachmentId as UUID).catch(() => null);
  if (!file) return new NextResponse('Not found', { status: 404 });

  // 파일명에 한글·베트남어가 들어가므로 RFC 5987 형식으로 인코딩한다
  const encoded = encodeURIComponent(file.meta.file_name);
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.meta.mime_type ?? 'application/octet-stream',
      'Content-Length': String(file.meta.size_bytes),
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
