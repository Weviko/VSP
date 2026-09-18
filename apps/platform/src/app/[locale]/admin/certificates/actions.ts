'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { issueCertificate, revokeCertificate, queryOne, type UUID } from '@vsp/core-admin';
import { workUserOrNull, requireWorkspace } from '@/lib/session';

/** 증명서 취소(무효화). 진위확인에서 '취소됨'으로 노출된다. 사유는 감사기록에 남는다. */
export async function revokeCertForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const certId = String(formData.get('cert_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (certId) await revokeCertificate(certId as UUID, reason, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/certificates`);
  redirect(`/${locale}/admin/certificates`);
}

/** 승인된 등록 건에 대해 증명서를 발급한다 */
export async function issueCertAction(input: {
  personName: string;
  orgId: string;
  certType: string;
  locale: string;
}): Promise<{ ok: boolean; verifyCode?: string; error?: string }> {
  const user = await workUserOrNull();
  if (!user) return { ok: false, error: 'FORBIDDEN' };
  try {
    const person = await queryOne<{ id: UUID; full_name: string }>(
      `SELECT id, full_name FROM core.person
        WHERE full_name = $1 AND deleted_at IS NULL LIMIT 1`,
      [input.personName]
    );
    if (!person) return { ok: false, error: 'PERSON_NOT_FOUND' };

    const cert = await issueCertificate(
      {
        personId: person.id,
        orgId: input.orgId as UUID,
        certType: input.certType as 'ATHLETE_REG',
        title: `${input.certType} — ${person.full_name}`,
      },
      { personId: user?.personId, orgId: user?.activeOrgId }
    );

    revalidatePath(`/${input.locale}/admin/certificates`);
    return { ok: true, verifyCode: cert.verify_code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
