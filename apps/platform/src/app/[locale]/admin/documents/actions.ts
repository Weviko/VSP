'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  receiveDocument, respondConcurrence, createDocument, sendDocument, requestConcurrence,
  searchOrgs, t as pick, type UUID,
} from '@vsp/core-admin';
import { workUserOrNull, requireWorkspace } from '@/lib/session';

type R = { ok: boolean; receiptNo?: string; error?: string };

/** 조직 선택기용 검색 (사전 로컬라이즈). 공개 종단점이라 화면과 별개로 requireWorkspace. */
export async function searchOrgsAction(
  locale: string,
  q: string
): Promise<Array<{ id: string; label: string; sub?: string }>> {
  await requireWorkspace(locale);
  const hits = await searchOrgs(q, { limit: 10 });
  return hits.map((o) => ({
    id: o.id,
    label: pick(o.name_i18n, locale as 'vi' | 'en' | 'ko'),
    sub: o.display_id ?? o.region_code ?? undefined,
  }));
}

/** 공문 기안+시행(발송)을 한 번에. 기안 기관은 로그인 사용자의 활동 조직. */
export async function createDispatchForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const title = String(formData.get('title') ?? '').trim();
  const toOrgId = String(formData.get('to_org_id') ?? '').trim();
  if (title && toOrgId && user.activeOrgId) {
    const doc = await createDocument(
      {
        title,
        body: String(formData.get('body') ?? '').trim() || null,
        docType: String(formData.get('doc_type') ?? '').trim() || null,
        confidentiality: String(formData.get('confidentiality') ?? '').trim() || undefined,
        fromOrgId: user.activeOrgId,
      },
      { personId: user.personId }
    );
    await sendDocument(
      {
        documentId: doc.id,
        fromOrgId: user.activeOrgId,
        toOrgIds: [toOrgId as UUID],
        replyDueOn: String(formData.get('reply_due_on') ?? '').trim() || null,
      },
      { personId: user.personId }
    );
  }
  revalidatePath(`/${locale}/admin/documents`);
  redirect(`/${locale}/admin/documents`);
}

/** 공문 상세에서 관련 기관에 합의 요청. */
export async function requestConcurrenceForm(locale: string, documentId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const orgId = String(formData.get('org_id') ?? '').trim();
  if (orgId) await requestConcurrence(documentId as UUID, [orgId as UUID], { personId: user.personId });
  revalidatePath(`/${locale}/admin/documents/${documentId}`);
  redirect(`/${locale}/admin/documents/${documentId}`);
}

/**
 * 공문 접수.
 * 접수하면 우리 기관의 접수 대장에 등재되고 접수번호가 발번된다.
 * 감사에서 가장 먼저 확인하는 것이 이 대장이다.
 */
export async function receiveAction(dispatchId: string, locale: string): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  if (!user?.personId || !user.activeOrgId) return { ok: false, error: 'NOT_LOGGED_IN' };
  try {
    const res = await receiveDocument(dispatchId as UUID, {
      personId: user.personId,
      orgId: user.activeOrgId,
    });
    revalidatePath(`/${locale}/admin/documents`);
    return { ok: true, receiptNo: res.receiptNo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 합의 응답.
 * 반대 의견도 그대로 기록된다. 기안 기관은 반대에도 불구하고 진행할 수 있으나,
 * 그 사실과 사유가 남아 나중에 "왜 그렇게 결정했나"를 설명할 근거가 된다.
 */
export async function respondConcurrenceAction(
  concurrenceId: string,
  status: 'AGREED' | 'DISAGREED',
  opinion: string,
  locale: string
): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  if (!user?.personId) return { ok: false, error: 'NOT_LOGGED_IN' };
  try {
    await respondConcurrence(
      concurrenceId as UUID,
      status,
      { personId: user.personId, orgId: user.activeOrgId },
      opinion || undefined
    );
    revalidatePath(`/${locale}/admin/documents`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
