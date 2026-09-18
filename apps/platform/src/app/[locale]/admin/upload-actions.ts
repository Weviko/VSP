'use server';

import { revalidatePath } from 'next/cache';
import {
  uploadAttachment, deleteAttachment, canDeleteAttachment, getMyOrgIds,
  UploadError, type UUID,
} from '@vsp/core-admin';
import { currentUser } from '@/lib/session';

/**
 * 첨부 업로드.
 *
 * 서버 액션은 결국 공개된 HTTP 종단점이다. 화면이 무엇을 보내든 서버가 다시 판단해야 한다.
 * 그래서 소유자를 클라이언트가 정하게 두지 않는다.
 *
 *   - 작성 중인 신청서의 첨부는 DRAFT 로 올라가고, 소유자는 올린 본인이다.
 *     제출이 성공하는 순간 그 신청서 소유로 옮겨진다(claimAttachments).
 *   - 이미 존재하는 대상(조직·행사)에 붙이는 첨부는 그 조직의 구성원만 올릴 수 있다.
 *
 * 크기·확장자 검증은 도메인에서 하고, 여기서는 그 오류를 화면 코드로 바꾼다.
 */
export async function uploadDraftAction(
  formData: FormData
): Promise<{ ok: boolean; id?: string; name?: string; size?: number; error?: string }> {
  const { user } = await currentUser();
  if (!user?.personId) return { ok: false, error: 'NOT_LOGGED_IN' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'NO_FILE' };

  try {
    const row = await uploadAttachment({
      ownerType: 'DRAFT',
      ownerId: user.personId,
      fileName: file.name,
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || null,
      uploadedBy: user.personId,
    });
    return { ok: true, id: row.id, name: row.file_name, size: row.size_bytes };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.code };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 이미 있는 조직 문서함에 첨부한다. 그 조직 구성원만 올릴 수 있다. */
export async function uploadOrgAction(
  formData: FormData
): Promise<{ ok: boolean; id?: string; name?: string; error?: string }> {
  const { user } = await currentUser();
  if (!user?.personId) return { ok: false, error: 'NOT_LOGGED_IN' };

  const file = formData.get('file');
  const orgId = String(formData.get('orgId') ?? '');
  const path = String(formData.get('path') ?? '');
  if (!(file instanceof File)) return { ok: false, error: 'NO_FILE' };
  if (!orgId) return { ok: false, error: 'NO_OWNER' };

  const myOrgs = await getMyOrgIds(user.personId);
  if (!myOrgs.includes(orgId as UUID)) return { ok: false, error: 'FORBIDDEN' };

  try {
    const row = await uploadAttachment({
      ownerType: 'ORG',
      ownerId: orgId as UUID,
      fileName: file.name,
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || null,
      uploadedBy: user.personId,
    });
    if (path) revalidatePath(path);
    return { ok: true, id: row.id, name: row.file_name };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.code };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 첨부 삭제.
 *
 * id 만 보내면 지워지게 두면 남의 기관 정산 증빙도 지울 수 있다.
 * 올린 본인이거나 소유 조직의 구성원일 때만 지운다(실제 파일은 남는다 — 감사 증빙).
 */
export async function deleteAttachmentAction(
  id: string,
  path?: string
): Promise<{ ok: boolean; error?: string }> {
  const { user } = await currentUser();
  if (!user?.personId) return { ok: false, error: 'NOT_LOGGED_IN' };

  const orgIds = await getMyOrgIds(user.personId);
  if (!(await canDeleteAttachment(id as UUID, { personId: user.personId, orgIds }))) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  try {
    await deleteAttachment(id as UUID, { personId: user.personId });
    if (path) revalidatePath(path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
