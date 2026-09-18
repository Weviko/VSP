'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createOrganization, updateOrganization, deactivateOrganization, reactivateOrganization,
  mergeOrganization, endMembership, searchOrgs, t as pick,
  query, type UUID,
} from '@vsp/core-admin';
import { workUserOrNull, requireWorkspace } from '@/lib/session';

const ORG_STATUSES = new Set(['ACTIVE', 'PENDING', 'SUSPENDED']);

export async function createOrgAction(input: {
  parentId: string | null;
  levelType: string;
  nameVi: string;
  nameEn?: string;
  nameKo?: string;
  displayId?: string;
  regionCode?: string;
  locale: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const org = await createOrganization(
      {
        parentId: input.parentId || null,
        levelType: input.levelType,
        nameI18n: {
          vi: input.nameVi,
          ...(input.nameEn ? { en: input.nameEn } : {}),
          ...(input.nameKo ? { ko: input.nameKo } : {}),
        },
        displayId: input.displayId || null,
        regionCode: input.regionCode || null,
        status: 'ACTIVE',
      },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );
    revalidatePath(`/${input.locale}/admin/organizations`);
    return { ok: true, id: org.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 조직 정보 수정. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다. 변경은 감사기록에 남는다. */
export async function updateOrgForm(locale: string, orgId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const st = String(formData.get('status') ?? '').trim();
  await updateOrganization(
    orgId as UUID,
    {
      nameI18n: {
        vi: String(formData.get('name_vi') ?? '').trim(),
        en: String(formData.get('name_en') ?? '').trim() || undefined,
        ko: String(formData.get('name_ko') ?? '').trim() || undefined,
      },
      shortName: String(formData.get('short_name') ?? '').trim() || null,
      regionCode: String(formData.get('region_code') ?? '').trim() || null,
      taxCode: String(formData.get('tax_code') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      status: ORG_STATUSES.has(st) ? st : undefined,
    },
    { personId: user.personId, orgId: user.activeOrgId }
  );
  revalidatePath(`/${locale}/admin/organizations/${orgId}`);
  redirect(`/${locale}/admin/organizations/${orgId}`);
}

export async function deactivateOrgForm(locale: string, orgId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await deactivateOrganization(orgId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/organizations`);
  redirect(`/${locale}/admin/organizations/${orgId}`);
}

export async function reactivateOrgForm(locale: string, orgId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await reactivateOrganization(orgId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/organizations/${orgId}`);
  redirect(`/${locale}/admin/organizations/${orgId}`);
}

/** 조직 선택기용 검색(사전 로컬라이즈). */
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

/** 조직 통합 — 이 조직(fromId)을 후속 조직(intoId)으로 흡수. 과거 기록은 보존된다. */
export async function mergeOrgForm(locale: string, fromId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const intoId = String(formData.get('into_id') ?? '').trim();
  const effectiveOn = String(formData.get('effective_on') ?? '').trim();
  if (intoId && effectiveOn && intoId !== fromId) {
    await mergeOrganization(fromId as UUID, intoId as UUID, effectiveOn, { personId: user.personId });
  }
  revalidatePath(`/${locale}/admin/organizations/${fromId}`);
  redirect(`/${locale}/admin/organizations/${intoId || fromId}`);
}

/** 조직 멤버 임기 종료(해임). */
export async function endMembershipForm(locale: string, orgId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const memberId = String(formData.get('member_id') ?? '').trim();
  if (memberId) await endMembership(memberId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/organizations/${orgId}`);
  redirect(`/${locale}/admin/organizations/${orgId}`);
}

/** 조직에 사람을 배치한다. 권한은 사람이 아니라 역할에 붙는다. */
export async function addMemberAction(input: {
  orgId: UUID;
  fullName: string;
  phone?: string;
  roleCode: string;
  title?: string;
  locale: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const existing = await query<{ id: UUID }>(
      `SELECT id FROM core.person WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
      [input.phone ?? null]
    );

    let personId = existing[0]?.id;
    if (!personId) {
      const created = await query<{ id: UUID }>(
        `INSERT INTO core.person (full_name, phone) VALUES ($1,$2) RETURNING id`,
        [input.fullName, input.phone ?? null]
      );
      personId = created[0].id;
    }

    await query(
      `INSERT INTO core.org_member (person_id, org_id, role_code, title)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [personId, input.orgId, input.roleCode, input.title ?? null]
    );

    revalidatePath(`/${input.locale}/admin/organizations/${input.orgId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
