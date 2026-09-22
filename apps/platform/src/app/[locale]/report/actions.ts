'use server';

import { redirect } from 'next/navigation';
import { fileReport, type IntegrityCategory, type UUID } from '@vsp/core-admin';
import { currentUser } from '@/lib/session';

const CATEGORIES = new Set(['VIOLENCE', 'SEXUAL', 'MATCH_FIXING', 'CORRUPTION', 'OTHER']);

/**
 * 공개 신고 접수. 로그인 불필요 — 익명 접수를 허용한다.
 * currentUser() 로 로그인 여부만 확인해(경계검사 [4] 충족) 실명 접수 시 제보자를 연결한다.
 * 접수번호(평문)는 한 번만 화면에 표시하고 서버에는 해시만 남는다.
 */
export async function submitIntegrityReport(locale: string, formData: FormData): Promise<void> {
  const { user } = await currentUser();

  const categoryRaw = String(formData.get('category') ?? '').trim();
  const category = (CATEGORIES.has(categoryRaw) ? categoryRaw : 'OTHER') as IntegrityCategory;
  const title = String(formData.get('title') ?? '').trim();
  const isAnonymous = String(formData.get('anonymous') ?? '') === 'on';

  if (!title) redirect(`/${locale}/report?err=1`);

  const result = await fileReport(
    {
      category,
      title,
      detail: String(formData.get('detail') ?? '').trim() || null,
      isAnonymous,
      reporterPersonId: !isAnonymous ? ((user?.personId ?? null) as UUID | null) : null,
      reporterContact: String(formData.get('contact') ?? '').trim() || null,
      respondentName: String(formData.get('respondent') ?? '').trim() || null,
    },
    { personId: !isAnonymous ? (user?.personId ?? null) : null }
  );

  // 접수번호는 이 리다이렉트에서 한 번만 노출한다(데모). 운영은 일회성 토큰으로 대체.
  redirect(`/${locale}/report?filed=1&code=${result.trackingCode}&case=${result.caseNo}`);
}
