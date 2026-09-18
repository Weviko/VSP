'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSeason, updateSeason, setCurrentSeason, type UUID } from '@vsp/core-admin';
import { requireWorkspace } from '@/lib/session';

/** 시즌 정보 수정. */
export async function updateSeasonForm(locale: string, seasonId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const code = String(formData.get('code') ?? '').trim();
  const nameVi = String(formData.get('name_vi') ?? '').trim();
  if (code && nameVi) {
    await updateSeason(
      seasonId as UUID,
      {
        code,
        nameI18n: {
          vi: nameVi,
          en: String(formData.get('name_en') ?? '').trim() || undefined,
          ko: String(formData.get('name_ko') ?? '').trim() || undefined,
        },
        startsOn: String(formData.get('starts_on') ?? '').trim() || undefined,
        endsOn: String(formData.get('ends_on') ?? '').trim() || undefined,
      },
      { personId: user.personId }
    );
  }
  revalidatePath(`/${locale}/admin/seasons`);
  redirect(`/${locale}/admin/seasons`);
}

/**
 * 시즌(회기) 관리 액션. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다.
 * 회기는 등록·대회의 연간 갱신 단위이므로 변경은 감사기록에 남는다.
 */

export async function createSeasonForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const code = String(formData.get('code') ?? '').trim();
  const startsOn = String(formData.get('starts_on') ?? '').trim();
  const endsOn = String(formData.get('ends_on') ?? '').trim();
  const nameVi = String(formData.get('name_vi') ?? '').trim();
  if (code && startsOn && endsOn && nameVi) {
    await createSeason(
      {
        code,
        nameI18n: {
          vi: nameVi,
          en: String(formData.get('name_en') ?? '').trim() || undefined,
          ko: String(formData.get('name_ko') ?? '').trim() || undefined,
        },
        startsOn,
        endsOn,
      },
      { personId: user.personId }
    );
  }
  revalidatePath(`/${locale}/admin/seasons`);
  redirect(`/${locale}/admin/seasons`);
}

export async function setCurrentSeasonForm(locale: string, seasonId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await setCurrentSeason(seasonId as UUID, { personId: user.personId });
  revalidatePath(`/${locale}/admin/seasons`);
  redirect(`/${locale}/admin/seasons`);
}
