/**
 * 전자결재 엔진.
 *
 * 설계 원칙
 *  1) 승인자를 "사람"이 아니라 "역할 + 조직"으로 지정한다.
 *     베트남 협회는 사무국 인원이 1~5명이고 교체가 잦다.
 *     담당자를 직접 지정하면 그 사람이 떠나는 순간 결재가 멈춘다.
 *  2) 결재선 자체가 데이터다. 단계 수·순서·조건을 관리자 화면에서 바꿀 수 있다.
 *  3) 모든 행위는 감사로그에 남는다. 정부 감사와 분쟁의 증거가 된다.
 */
import { query, queryOne, tx, type DbClient } from './db';
import { writeAudit } from './audit';
import type { UUID, RoleCode } from './types';
import type { I18nText } from './i18n';

// 순수 타입은 workflow-types.ts 에 있다 (클라이언트 번들 안전)
export type { ActionType, ApproverType } from './workflow-types';
import type { ActionType, ApproverType } from './workflow-types';

export interface WorkflowStep {
  id: UUID;
  workflow_id: UUID;
  step_no: number;
  name_i18n: I18nText;
  approver_type: ApproverType;
  approver_role: RoleCode | null;
  approver_org_id: UUID | null;
  mode: 'SEQUENTIAL' | 'PARALLEL_ALL' | 'PARALLEL_ANY';
  condition: StepCondition | null;
  sla_hours: number | null;
  can_delegate: boolean;
  is_final: boolean;
}

/** 조건부 단계: 예) 금액이 1억 동 이상일 때만 상급 승인을 추가 */
export interface StepCondition {
  field: string;
  gte?: number;
  lte?: number;
  eq?: unknown;
}

export interface WorkflowInstance {
  id: UUID;
  workflow_id: UUID;
  submission_id: UUID;
  current_step: number;
  status: 'RUNNING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  started_at: string;
  finished_at: string | null;
}

export interface ActorContext {
  personId: UUID;
  orgId: UUID | null;
  roleCodes: RoleCode[];
  ip?: string | null;
}

export class WorkflowError extends Error {
  constructor(public code: 'NOT_RUNNING' | 'NOT_AUTHORIZED' | 'NO_STEP', message: string) {
    super(message);
  }
}

/** 해당 서식에 적용할 결재선을 찾는다 (조직 전용 -> 표준) */
export async function findWorkflowForForm(
  formCode: string,
  orgId?: UUID | null
): Promise<{ id: UUID; code: string } | null> {
  return queryOne<{ id: UUID; code: string }>(
    `SELECT id, code FROM core.workflow_definition
      WHERE applies_to_form = $1 AND status = 'ACTIVE'
        AND (org_id IS NULL OR org_id = $2::uuid)
      ORDER BY (org_id = $2::uuid) DESC NULLS LAST, version DESC
      LIMIT 1`,
    [formCode, orgId ?? null]
  );
}

export async function getSteps(workflowId: UUID): Promise<WorkflowStep[]> {
  return query<WorkflowStep>(
    `SELECT * FROM core.workflow_step WHERE workflow_id = $1 ORDER BY step_no`,
    [workflowId]
  );
}

/** 조건부 단계 평가. 조건이 없으면 항상 수행한다. */
export function stepApplies(step: WorkflowStep, data: Record<string, unknown>): boolean {
  const c = step.condition;
  if (!c) return true;
  const v = data[c.field];
  if (c.eq !== undefined) return v === c.eq;
  const n = Number(v);
  if (Number.isNaN(n)) return false;
  if (c.gte !== undefined && n < c.gte) return false;
  if (c.lte !== undefined && n > c.lte) return false;
  return true;
}

/** 결재 시작 */
export async function startWorkflow(
  submissionId: UUID,
  formCode: string,
  submitterOrgId?: UUID | null
): Promise<WorkflowInstance | null> {
  const wf = await findWorkflowForForm(formCode, submitterOrgId);
  if (!wf) return null;

  return tx(async (client) => {
    const res = await client.query<WorkflowInstance>(
      `INSERT INTO core.workflow_instance (workflow_id, submission_id, current_step, status)
       VALUES ($1, $2, 1, 'RUNNING') RETURNING *`,
      [wf.id, submissionId]
    );
    await client.query(
      `UPDATE core.form_submission SET status = 'IN_REVIEW', updated_at = now() WHERE id = $1`,
      [submissionId]
    );
    const inst = res.rows[0];
    await writeAudit(
      {
        entitySchema: 'core',
        entityTable: 'workflow_instance',
        entityId: inst.id,
        action: 'START',
        after: { workflow: wf.code, submission_id: submissionId },
      },
      client
    );
    return inst;
  });
}

/**
 * 현재 단계에서 승인 권한이 있는 조직을 계산한다.
 * 반환된 조직의 해당 역할 보유자가 결재할 수 있다.
 *
 * client를 받는 이유: 트랜잭션 안에서 호출될 때 반드시 같은 커넥션을 써야 한다.
 * 풀에서 별도 커넥션을 가져오면 그 조회는 트랜잭션 밖에서 실행되어
 * 아직 커밋되지 않은 변경을 보지 못하고, 커넥션 고갈이나 교착을 부른다.
 */
export async function resolveApproverOrg(
  step: WorkflowStep,
  submitterOrgId: UUID | null,
  client?: DbClient
): Promise<UUID | null> {
  switch (step.approver_type) {
    case 'SPECIFIC_ORG':
    case 'ROLE_IN_ORG':
      return step.approver_org_id ?? null;
    case 'SUBMITTER_ORG_HEAD':
      return submitterOrgId;
    case 'ROLE_IN_PARENT_ORG': {
      if (!submitterOrgId) return null;
      const sql = `SELECT parent_id FROM core.organization WHERE id = $1`;
      if (client) {
        const res = await client.query(sql, [submitterOrgId]);
        return (res.rows[0]?.parent_id as UUID | null) ?? null;
      }
      const row = await queryOne<{ parent_id: UUID | null }>(sql, [submitterOrgId]);
      return row?.parent_id ?? null;
    }
    default:
      return null;
  }
}

/**
 * 결재 처리.
 * APPROVE - 다음 단계로. 마지막 단계면 신청서를 APPROVED로 확정.
 * REJECT  - 즉시 종료(반려).
 * RETURN  - 신청자에게 보완 요청. 결재는 살아 있고 신청자가 고쳐서 다시 올린다.
 */
export async function act(
  instanceId: UUID,
  action: ActionType,
  actor: ActorContext,
  comment?: string
): Promise<WorkflowInstance> {
  return tx(async (client) => {
    const instRes = await client.query<
      WorkflowInstance & { submitter_org_id: UUID | null; data: Record<string, unknown> }
    >(
      `SELECT wi.*, fs.submitter_org_id, fs.data
         FROM core.workflow_instance wi
         JOIN core.form_submission fs ON fs.id = wi.submission_id
        WHERE wi.id = $1 FOR UPDATE`,
      [instanceId]
    );
    const inst = instRes.rows[0];
    if (!inst) throw new WorkflowError('NOT_RUNNING', 'instance not found');
    if (inst.status !== 'RUNNING')
      throw new WorkflowError('NOT_RUNNING', `instance is ${inst.status}`);

    const stepsRes = await client.query<WorkflowStep>(
      `SELECT * FROM core.workflow_step WHERE workflow_id = $1 ORDER BY step_no`,
      [inst.workflow_id]
    );
    const steps = stepsRes.rows;
    const step = steps.find((s) => s.step_no === inst.current_step);
    if (!step) throw new WorkflowError('NO_STEP', `step ${inst.current_step} not found`);

    // 권한 검증: 시스템 관리자는 통과, 그 외는 지정 조직의 지정 역할이어야 한다
    if (!actor.roleCodes.includes('SYS_ADMIN')) {
      const approverOrg = await resolveApproverOrg(step, inst.submitter_org_id, client);
      const roleOk = !step.approver_role || actor.roleCodes.includes(step.approver_role);
      const orgOk = !approverOrg || actor.orgId === approverOrg;
      if (!roleOk || !orgOk)
        throw new WorkflowError('NOT_AUTHORIZED', 'no approval right at this step');
    }

    await client.query(
      `INSERT INTO core.workflow_action
         (instance_id, step_no, actor_person_id, actor_org_id, action, comment)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [instanceId, inst.current_step, actor.personId, actor.orgId, action, comment ?? null]
    );

    let next: WorkflowInstance = inst;

    if (action === 'REJECT') {
      await client.query(
        `UPDATE core.workflow_instance SET status='REJECTED', finished_at=now() WHERE id=$1`,
        [instanceId]
      );
      await client.query(
        `UPDATE core.form_submission SET status='REJECTED', decided_at=now(), updated_at=now()
          WHERE id=$1`,
        [inst.submission_id]
      );
      next = { ...inst, status: 'REJECTED' };
    } else if (action === 'RETURN') {
      await client.query(
        `UPDATE core.form_submission SET status='SUBMITTED', updated_at=now() WHERE id=$1`,
        [inst.submission_id]
      );
    } else if (action === 'APPROVE') {
      // 조건에 맞는 다음 단계를 찾는다 (조건 불일치 단계는 건너뛴다)
      const nextStep = steps
        .filter((s) => s.step_no > inst.current_step)
        .find((s) => stepApplies(s, inst.data ?? {}));

      if (!nextStep || step.is_final) {
        await client.query(
          `UPDATE core.workflow_instance SET status='APPROVED', finished_at=now() WHERE id=$1`,
          [instanceId]
        );
        await client.query(
          `UPDATE core.form_submission SET status='APPROVED', decided_at=now(), updated_at=now()
            WHERE id=$1`,
          [inst.submission_id]
        );
        next = { ...inst, status: 'APPROVED' };
      } else {
        await client.query(`UPDATE core.workflow_instance SET current_step=$2 WHERE id=$1`, [
          instanceId,
          nextStep.step_no,
        ]);
        next = { ...inst, current_step: nextStep.step_no };
      }
    }

    await writeAudit(
      {
        actorPersonId: actor.personId,
        actorOrgId: actor.orgId,
        actorIp: actor.ip,
        entitySchema: 'core',
        entityTable: 'workflow_instance',
        entityId: instanceId,
        action,
        before: { step: inst.current_step, status: inst.status },
        after: { step: next.current_step, status: next.status },
        note: comment ?? null,
      },
      client
    );

    return next;
  });
}

export interface PendingItem {
  instance_id: UUID;
  submission_id: UUID;
  form_code: string;
  form_title: I18nText;
  step_no: number;
  step_name: I18nText;
  submitter_org_id: UUID | null;
  submitted_at: string | null;
  due_at: string | null;
  overdue: boolean;
}

/**
 * 내가 결재해야 할 건 목록.
 * 법정 기한(due_at)이 지난 건을 맨 위로 올린다.
 * 베트남 체육법상 대회 개최 승인은 10일 이내 결정이므로 지연이 곧 법 위반이 된다.
 */
export async function listPendingFor(actor: ActorContext): Promise<PendingItem[]> {
  return query<PendingItem>(
    `SELECT wi.id AS instance_id, fs.id AS submission_id,
            fd.code AS form_code, fd.title_i18n AS form_title,
            ws.step_no, ws.name_i18n AS step_name,
            fs.submitter_org_id, fs.submitted_at, fs.due_at,
            (fs.due_at IS NOT NULL AND fs.due_at < now()) AS overdue
       FROM core.workflow_instance wi
       JOIN core.form_submission fs ON fs.id = wi.submission_id
       JOIN core.form_definition fd ON fd.id = fs.form_id
       JOIN core.workflow_step ws ON ws.workflow_id = wi.workflow_id
                                 AND ws.step_no = wi.current_step
      WHERE wi.status = 'RUNNING'
        AND (
          $1::boolean
          OR (ws.approver_type = 'SUBMITTER_ORG_HEAD' AND fs.submitter_org_id = $2::uuid)
          OR (ws.approver_type = 'ROLE_IN_PARENT_ORG'
              AND $2::uuid = (SELECT o.parent_id FROM core.organization o
                               WHERE o.id = fs.submitter_org_id))
          OR (ws.approver_type IN ('ROLE_IN_ORG','SPECIFIC_ORG') AND ws.approver_org_id = $2::uuid)
        )
        AND (ws.approver_role IS NULL OR ws.approver_role = ANY($3::text[]))
      ORDER BY overdue DESC, fs.due_at NULLS LAST, fs.submitted_at`,
    [actor.roleCodes.includes('SYS_ADMIN'), actor.orgId, actor.roleCodes]
  );
}

/** 결재 이력 (문서 하단 결재선 표시용) */
export async function getActions(instanceId: UUID) {
  return query(
    `SELECT wa.*, p.full_name AS actor_name, o.name_i18n AS actor_org_name
       FROM core.workflow_action wa
       LEFT JOIN core.person p ON p.id = wa.actor_person_id
       LEFT JOIN core.organization o ON o.id = wa.actor_org_id
      WHERE wa.instance_id = $1
      ORDER BY wa.acted_at`,
    [instanceId]
  );
}
