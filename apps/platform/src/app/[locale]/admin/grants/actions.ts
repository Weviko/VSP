'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  recordExecution, submitSettlement, inspectSettlement,
  createProgram, setProgramStatus, applyToProgram,
  DuplicateEvidenceError, OverExecutionError,
  type UUID, type FundSource,
} from '@vsp/core-admin';
import { workUserOrNull, requireWorkspace } from '@/lib/session';

type R = { ok: boolean; error?: string };

const PROGRAM_STATUSES = new Set(['DRAFT', 'OPEN', 'CLOSED', 'AWARDED']);

/** 보조금 사업 개설. 주관 기관은 로그인 사용자의 활동 조직. */
export async function createProgramForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const nameVi = String(formData.get('name_vi') ?? '').trim();
  const fiscalYear = Number(String(formData.get('fiscal_year') ?? '').trim());
  if (nameVi && user.activeOrgId && Number.isFinite(fiscalYear)) {
    await createProgram(
      {
        ownerOrgId: user.activeOrgId,
        code: String(formData.get('code') ?? '').trim() || null,
        nameI18n: {
          vi: nameVi,
          en: String(formData.get('name_en') ?? '').trim() || undefined,
          ko: String(formData.get('name_ko') ?? '').trim() || undefined,
        },
        fiscalYear,
        programType: String(formData.get('program_type') ?? 'OPEN_CALL') === 'DESIGNATED' ? 'DESIGNATED' : 'OPEN_CALL',
        totalBudget: String(formData.get('total_budget') ?? '').trim() ? Number(formData.get('total_budget')) : null,
        appliesFrom: String(formData.get('applies_from') ?? '').trim() || null,
        appliesTo: String(formData.get('applies_to') ?? '').trim() || null,
      },
      { personId: user.personId }
    );
  }
  revalidatePath(`/${locale}/admin/grants`);
  redirect(`/${locale}/admin/grants`);
}

/** 공모 개시/마감 등 상태 전환. */
export async function setProgramStatusForm(locale: string, programId: string, formData: FormData): Promise<void> {
  await requireWorkspace(locale);
  const status = String(formData.get('status') ?? '').trim();
  if (PROGRAM_STATUSES.has(status)) await setProgramStatus(programId as UUID, status);
  revalidatePath(`/${locale}/admin/grants/programs/${programId}`);
  redirect(`/${locale}/admin/grants/programs/${programId}`);
}

/** 보조금 신청(신청 기관 = 로그인 사용자의 활동 조직). */
export async function applyToProgramForm(locale: string, programId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const requested = Number(String(formData.get('requested_amount') ?? '').trim());
  if (user.activeOrgId && Number.isFinite(requested) && requested > 0) {
    await applyToProgram({
      programId: programId as UUID,
      applicantOrgId: user.activeOrgId,
      requestedAmount: requested,
      selfFunding: String(formData.get('self_funding') ?? '').trim() ? Number(formData.get('self_funding')) : 0,
      summary: String(formData.get('summary') ?? '').trim() || null,
    });
  }
  revalidatePath(`/${locale}/admin/grants/programs/${programId}`);
  redirect(`/${locale}/admin/grants/programs/${programId}`);
}

/**
 * 집행 기록.
 * 초과 집행과 중복 증빙은 도메인에서 막는다. 여기서는 그 오류를
 * 화면이 이해할 수 있는 코드로 바꿔 전달한다.
 */
export async function recordExecutionAction(input: {
  awardId: string;
  executedOn: string;
  amount: number;
  fundSource: string;
  payee?: string;
  description?: string;
  evidenceNo?: string;
  locale: string;
}): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await recordExecution(
      {
        awardId: input.awardId as UUID,
        executedOn: input.executedOn,
        amount: input.amount,
        fundSource: input.fundSource as FundSource,
        payee: input.payee || null,
        description: input.description || null,
        evidenceNo: input.evidenceNo || null,
      },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );
    revalidatePath(`/${input.locale}/admin/grants/awards/${input.awardId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof OverExecutionError) return { ok: false, error: `OVER:${e.available}` };
    if (e instanceof DuplicateEvidenceError) return { ok: false, error: `DUP:${e.evidenceNo}` };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 정산 제출. 집행 합계는 시스템이 계산하므로 반납·이월만 입력받는다. */
export async function submitSettlementAction(input: {
  awardId: string;
  returnedAmount: number;
  carriedOverAmount: number;
  locale: string;
}): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await submitSettlement(
      input.awardId as UUID,
      { returnedAmount: input.returnedAmount, carriedOverAmount: input.carriedOverAmount },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );
    revalidatePath(`/${input.locale}/admin/grants/awards/${input.awardId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function inspectAction(input: {
  awardId: string;
  result: 'PASS' | 'CONDITIONAL' | 'FAIL';
  findings?: string;
  recoveryAmount?: number;
  locale: string;
}): Promise<R> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    await inspectSettlement(
      input.awardId as UUID,
      {
        result: input.result,
        findings: input.findings,
        recoveryAmount: input.recoveryAmount ?? 0,
      },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );
    revalidatePath(`/${input.locale}/admin/grants/awards/${input.awardId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 교부 결정. 상위 교부액 초과는 도메인에서 막는다. */
export async function decideAwardAction(input: {
  programId: string;
  applicationId?: string | null;
  parentAwardId?: string | null;
  granteeOrgId: string;
  decisionNo?: string;
  awardedAmount: number;
  selfFunding?: number;
  dedicatedAccount?: string;
  settlementDueOn?: string;
  locale: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const { decideAward, OverAwardError } = await import('@vsp/core-admin');
    try {
      const a = await decideAward(
        {
          programId: input.programId as UUID,
          applicationId: (input.applicationId as UUID) ?? null,
          parentAwardId: (input.parentAwardId as UUID) ?? null,
          granteeOrgId: input.granteeOrgId as UUID,
          decisionNo: input.decisionNo || null,
          awardedAmount: input.awardedAmount,
          selfFunding: input.selfFunding ?? 0,
          dedicatedAccount: input.dedicatedAccount || null,
          settlementDueOn: input.settlementDueOn || null,
        },
        { personId: user?.personId, orgId: user?.activeOrgId }
      );
      revalidatePath(`/${input.locale}/admin/grants/programs/${input.programId}`);
      revalidatePath(`/${input.locale}/admin/grants`);
      return { ok: true, id: a.id };
    } catch (e) {
      if (e instanceof OverAwardError) return { ok: false, error: `OVER:${e.available}` };
      throw e;
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
