'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createFeeRule, deleteFeeRule, createPaymentOrder, recordOfflinePayment,
  FeeCapExceededError, type UUID,
} from '@vsp/core-admin';
import { workUserOrNull, requireWorkspace } from '@/lib/session';

/** 요금 규칙 삭제. */
export async function deleteFeeRuleForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('rule_id') ?? '').trim();
  if (id) await deleteFeeRule(id as UUID, user.personId);
  revalidatePath(`/${locale}/admin/payments`);
  redirect(`/${locale}/admin/payments`);
}

export async function createFeeRuleAction(input: {
  orgId: string;
  code: string;
  nameVi: string;
  amount: number;
  locale: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await createFeeRule({
      orgId: input.orgId as UUID,
      code: input.code,
      nameI18n: { vi: input.nameVi },
      amount: input.amount,
    });
    revalidatePath(`/${input.locale}/admin/payments`);
    return { ok: true };
  } catch (e) {
    if (e instanceof FeeCapExceededError)
      return { ok: false, error: `FEE_CAP_EXCEEDED:${e.cap}` };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createOrderAction(input: {
  payeeOrgId: string;
  amount: number;
  locale: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await createPaymentOrder({
      payeeOrgId: input.payeeOrgId as UUID,
      payerPersonId: user?.personId ?? null,
      amount: input.amount,
      refType: 'REGISTRATION',
    });
    revalidatePath(`/${input.locale}/admin/payments`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 현장 현금 수납 기록. 누가 입력했는지 감사로그에 남는다. */
export async function recordCashAction(
  orderId: string,
  locale: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  if (!user?.personId) return { ok: false, error: 'NOT_LOGGED_IN' };
  try {
    await recordOfflinePayment(orderId as UUID, {
      personId: user.personId,
      orgId: user.activeOrgId,
    });
    revalidatePath(`/${locale}/admin/payments`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
