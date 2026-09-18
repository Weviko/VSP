'use server';

import { revalidatePath } from 'next/cache';
import { act, WorkflowError, type ActionType } from '@vsp/core-admin';
import { workUserOrNull } from '@/lib/session';

/**
 * 결재 처리.
 * 권한 검증은 엔진 안에서 한다(역할 + 조직). 여기서는 세션에서 행위자를 채워 넘길 뿐이다.
 */
export async function actOnApproval(
  instanceId: string,
  action: ActionType,
  locale: string,
  comment?: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  if (!user?.personId) return { ok: false, error: 'NOT_LOGGED_IN' };

  try {
    await act(instanceId, action, {
      personId: user.personId,
      orgId: user.activeOrgId,
      roleCodes: user.roleCodes,
    });
    revalidatePath(`/${locale}/admin/approvals`);
    return { ok: true };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, error: e.code };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
