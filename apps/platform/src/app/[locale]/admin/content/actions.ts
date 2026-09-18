'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createArticle, updateArticle, setArticleStatus, deleteArticle, submitArticleForReview,
  issuePressCredential, setCredentialStatus, updatePressCredential, searchPersons,
  t as pick,
  type UUID, type ArticleStatus, type CredentialStatus, type ArticleSource, type PersonHit,
} from '@vsp/core-admin';
import { getEvent, listMatches } from '@vsp/sport-domain';
import { requireWorkspace } from '@/lib/session';

/**
 * 콘텐츠 행정 액션 — 기사 작성·검수 + 기자 자격.
 * 모두 공개 종단점이므로 화면과 별개로 requireWorkspace 로 권한을 확인한다.
 */

const ARTICLE_STATUSES: ArticleStatus[] = ['DRAFT', 'REVIEW', 'PUBLISHED', 'HIDDEN'];
const CRED_STATUSES: CredentialStatus[] = ['ACTIVE', 'SUSPENDED', 'EXPIRED'];

export async function createArticleForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const title = String(formData.get('title') ?? '').trim();
  const source = String(formData.get('source') ?? 'ORG') as ArticleSource;
  if (!title) redirect(`/${locale}/admin/content`);
  const art = await createArticle(
    { titleI18n: { [locale]: title }, source, authorOrgId: user.activeOrgId },
    user.personId
  );
  redirect(`/${locale}/admin/content/${art.id}`);
}

export async function updateArticleForm(locale: string, articleId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const title = String(formData.get('title') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const cover = String(formData.get('cover_url') ?? '').trim();
  const sportId = String(formData.get('sport_id') ?? '').trim();
  const eventId = String(formData.get('event_id') ?? '').trim();
  const tagsRaw = String(formData.get('tags') ?? '').trim();
  await updateArticle(
    articleId as UUID,
    {
      titleI18n: title ? { [locale]: title } : undefined,
      summaryI18n: { [locale]: summary },
      bodyI18n: { [locale]: body },
      coverUrl: cover || null,
      sportId: (sportId as UUID) || null,
      eventId: (eventId as UUID) || null,
      tags: tagsRaw ? tagsRaw.split(',').map((s) => s.trim()).filter(Boolean) : null,
    },
    user.personId
  );
  revalidatePath(`/${locale}/admin/content/${articleId}`);
  redirect(`/${locale}/admin/content/${articleId}`);
}

export async function setArticleStatusForm(locale: string, articleId: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const status = String(formData.get('status') ?? '') as ArticleStatus;
  if (ARTICLE_STATUSES.includes(status)) await setArticleStatus(articleId as UUID, status, user.personId);
  revalidatePath(`/${locale}/admin/content/${articleId}`);
  redirect(`/${locale}/admin/content/${articleId}`);
}

/** 검수 요청 — 정식 전자결재선(ARTICLE_REVIEW)에 태운다(결재함에 노출). */
export async function submitReviewForm(locale: string, articleId: string): Promise<void> {
  const user = await requireWorkspace(locale);
  await submitArticleForReview(articleId as UUID, { personId: user.personId, orgId: user.activeOrgId });
  revalidatePath(`/${locale}/admin/content/${articleId}`);
  redirect(`/${locale}/admin/content/${articleId}`);
}

export async function deleteArticleForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('article_id') ?? '') as UUID;
  if (id) await deleteArticle(id, user.personId);
  revalidatePath(`/${locale}/admin/content`);
  redirect(`/${locale}/admin/content`);
}

/**
 * 결과 기반 자동 기사 — 종료된 경기 결과를 문장으로 조립해 초안(AUTO)으로 만든다.
 * 종목 데이터가 필요하므로 앱 계층에서 조립하고 core-admin 에는 저장만 시킨다.
 * 사람이 검토·게시한다(자동 게시하지 않는다).
 */
export async function generateResultArticleForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const eventId = String(formData.get('event_id') ?? '').trim();
  if (!eventId) redirect(`/${locale}/admin/content`);
  const event = await getEvent(eventId as UUID);
  if (!event) redirect(`/${locale}/admin/content`);
  const matches = (await listMatches(eventId as UUID)).filter((m) => m.status === 'FINISHED');

  const nameVi = pick(event.name_i18n, 'vi');
  const nameKo = pick(event.name_i18n, 'ko');
  const line = (m: (typeof matches)[number]) => {
    const a = m.participants.find((p) => ['A', 'HOME'].includes(p.side ?? ''));
    const b = m.participants.find((p) => ['B', 'AWAY'].includes(p.side ?? ''));
    const sa = a?.score != null ? Number(a.score) : '-';
    const sb = b?.score != null ? Number(b.score) : '-';
    return `${m.round_name ?? ''} ${a?.label ?? 'A'} ${sa}-${sb} ${b?.label ?? 'B'}`.trim();
  };
  const bodyVi = matches.length
    ? `Kết quả các trận đã kết thúc tại ${nameVi}:\n\n` + matches.map(line).join('\n')
    : `Chưa có trận nào kết thúc tại ${nameVi}.`;
  const bodyKo = matches.length
    ? `${nameKo}의 종료된 경기 결과:\n\n` + matches.map(line).join('\n')
    : `${nameKo}에서 종료된 경기가 아직 없습니다.`;

  const art = await createArticle(
    {
      titleI18n: { vi: `${nameVi} — Kết quả`, ko: `${nameKo} — 결과` },
      summaryI18n: { vi: `Tổng hợp ${matches.length} trận đã kết thúc.`, ko: `종료된 ${matches.length}경기 요약.` },
      bodyI18n: { vi: bodyVi, ko: bodyKo },
      source: 'AUTO',
      sportId: event.sport_id,
      eventId: eventId as UUID,
      tags: ['auto'],
      authorOrgId: user.activeOrgId,
    },
    user.personId
  );
  redirect(`/${locale}/admin/content/${art.id}`);
}

// ── 기자 자격 ────────────────────────────────────────────────────────────────

/** 사람 선택기용 검색. 공개 종단점이라 화면과 별개로 requireWorkspace 를 부른다. */
export async function searchPersonsAction(locale: string, q: string): Promise<PersonHit[]> {
  await requireWorkspace(locale);
  return searchPersons(q, { limit: 10 });
}

export async function issueCredentialForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const personId = String(formData.get('person_id') ?? '').trim();
  const credentialNo = String(formData.get('credential_no') ?? '').trim();
  const validTo = String(formData.get('valid_to') ?? '').trim();
  if (personId && user.activeOrgId) {
    await issuePressCredential(
      {
        personId: personId as UUID,
        approvedByOrgId: user.activeOrgId,
        mediaOrgId: null,
        credentialNo: credentialNo || null,
        validTo: validTo || null,
      },
      user.personId
    );
  }
  revalidatePath(`/${locale}/admin/content`);
  redirect(`/${locale}/admin/content#press`);
}

export async function updateCredentialForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('credential_id') ?? '').trim();
  if (id) {
    await updatePressCredential(
      id as UUID,
      {
        credentialNo: String(formData.get('credential_no') ?? '').trim() || null,
        validTo: String(formData.get('valid_to') ?? '').trim() || null,
      },
      user.personId
    );
  }
  revalidatePath(`/${locale}/admin/content`);
  redirect(`/${locale}/admin/content#press`);
}

export async function setCredentialStatusForm(locale: string, formData: FormData): Promise<void> {
  const user = await requireWorkspace(locale);
  const id = String(formData.get('credential_id') ?? '') as UUID;
  const status = String(formData.get('status') ?? '') as CredentialStatus;
  if (id && CRED_STATUSES.includes(status)) await setCredentialStatus(id, status, user.personId);
  revalidatePath(`/${locale}/admin/content`);
  redirect(`/${locale}/admin/content#press`);
}
