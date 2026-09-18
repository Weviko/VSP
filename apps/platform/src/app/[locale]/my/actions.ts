'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  subscribe, unsubscribe,
  setSponsorshipProfile, respondProposal, SponsorshipError,
  type UUID,
} from '@vsp/core-admin';
import { requireMember } from '@/lib/session';

/**
 * 관심 종목 구독/해지 (폼에서 직접 호출 — 클라이언트 컴포넌트 불필요).
 *
 * 로그인한 본인만 자기 구독을 바꾼다. requireMember 로 회원 여부를 확인하고,
 * 구독은 항상 그 세션의 personId 로 한다 — 화면이 남의 id 를 보내도 소용없다.
 */
function readTarget(formData: FormData): { type: 'SPORT' | 'ORG'; id: UUID } | null {
  const type = String(formData.get('target_type') ?? '');
  const id = String(formData.get('target_id') ?? '');
  if ((type !== 'SPORT' && type !== 'ORG') || !id) return null;
  return { type, id: id as UUID };
}

export async function subscribeForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  const target = readTarget(formData);
  if (user.personId && target) await subscribe(user.personId, target.type, target.id);
  revalidatePath(`/${locale}/my`);
}

export async function unsubscribeForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  const target = readTarget(formData);
  if (user.personId && target) await unsubscribe(user.personId, target.type, target.id);
  revalidatePath(`/${locale}/my`);
}

/**
 * 후원 프로필 켜기/끄기 (문서 06).
 *
 * 항상 세션의 personId 로만 바꾼다. 미성년·비선수 가드는 core-admin 에 있고,
 * 막히면 SponsorshipError.code 를 주소로 되돌려 화면에서 안내한다(자금·연락처는 여기서 다루지 않는다).
 */
export async function setSponsorshipForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  if (!user.personId) return;
  const isOpen = String(formData.get('is_open') ?? '') === 'on';
  const headline = String(formData.get('headline') ?? '').trim();
  try {
    await setSponsorshipProfile(user.personId, {
      isOpen,
      headlineI18n: headline ? { [locale]: headline } : undefined,
    });
  } catch (e) {
    if (e instanceof SponsorshipError) redirect(`/${locale}/my?sponsorErr=${e.code}#sponsor`);
    throw e;
  }
  revalidatePath(`/${locale}/my`);
  redirect(`/${locale}/my#sponsor`);
}

/** 받은 후원 제안 수락/거절. 자기에게 온 제안만 (core-admin 이 소유자 검증). */
export async function respondProposalForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireMember(locale);
  const proposalId = String(formData.get('proposal_id') ?? '') as UUID;
  const decision = String(formData.get('decision') ?? '');
  if (user.personId && proposalId && (decision === 'ACCEPTED' || decision === 'DECLINED')) {
    await respondProposal(proposalId, user.personId, decision);
  }
  revalidatePath(`/${locale}/my`);
  redirect(`/${locale}/my#sponsor`);
}
