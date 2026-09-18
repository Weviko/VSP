/**
 * 콘텐츠 행정 — 기사 작성·검수 + 기자 자격 (문서 04).
 *
 * 기사는 초안(DRAFT) → 검수(REVIEW) → 게시(PUBLISHED)/숨김(HIDDEN) 흐름을 탄다.
 * 출처(source)로 자동생성(AUTO)·기자기고(PRESS)·협회(ORG)·제휴(PARTNER)를 구분해 독자가 신뢰의
 * 근거를 안다. 공개 노출은 pub.article 뷰(게시된 것만·기자 개인명 비공개)가 강제한다.
 *
 * 결과 기반 자동 기사 조립(경기 결과 → 문장)은 종목 데이터가 필요하므로 앱 계층에서 하고,
 * 여기서는 저장만 한다(core-admin 은 sport-domain 을 import 하지 않는다).
 */
import { query, queryOne } from './db';
import { writeAudit } from './audit';
import { getForm } from './form';
import { startWorkflow } from './workflow';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type ArticleStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'HIDDEN';
export type ArticleSource = 'AUTO' | 'PRESS' | 'ORG' | 'PARTNER';

export interface ArticleRow {
  id: UUID;
  slug: string;
  title_i18n: I18nText;
  summary_i18n: I18nText | null;
  body_i18n: I18nText | null;
  cover_url: string | null;
  source: string;
  sport_id: UUID | null;
  event_id: UUID | null;
  tags: string[] | null;
  author_person_id: UUID | null;
  author_org_id: UUID | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleInput {
  titleI18n: I18nText;
  summaryI18n?: I18nText | null;
  bodyI18n?: I18nText | null;
  coverUrl?: string | null;
  source?: ArticleSource;
  sportId?: UUID | null;
  eventId?: UUID | null;
  tags?: string[] | null;
  authorPersonId?: UUID | null;
  authorOrgId?: UUID | null;
}

/** 제목에서 SEO 슬러그를 만든다(성조 제거·소문자). 충돌을 피해 짧은 접미사를 붙인다. */
function slugify(text: string): string {
  const base = text
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'bai-viet'}-${suffix}`;
}

export async function listArticles(filter: {
  status?: ArticleStatus;
  sportId?: UUID;
  eventId?: UUID;
  limit?: number;
} = {}): Promise<ArticleRow[]> {
  return query<ArticleRow>(
    `SELECT id, slug, title_i18n, summary_i18n, body_i18n, cover_url, source, sport_id, event_id,
            tags, author_person_id, author_org_id, status, published_at::text, created_at::text, updated_at::text
       FROM content.article
      WHERE deleted_at IS NULL
        AND ($1::text IS NULL OR status = $1)
        AND ($2::uuid IS NULL OR sport_id = $2)
        AND ($3::uuid IS NULL OR event_id = $3)
      ORDER BY updated_at DESC
      LIMIT $4`,
    [filter.status ?? null, filter.sportId ?? null, filter.eventId ?? null, filter.limit ?? 100]
  );
}

export async function getArticleById(id: UUID): Promise<ArticleRow | null> {
  return queryOne<ArticleRow>(
    `SELECT id, slug, title_i18n, summary_i18n, body_i18n, cover_url, source, sport_id, event_id,
            tags, author_person_id, author_org_id, status, published_at::text, created_at::text, updated_at::text
       FROM content.article WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
}

/** 기사 생성 (기본 DRAFT). AUTO 출처는 자동생성 기사에 쓴다. */
export async function createArticle(input: ArticleInput, actorPersonId?: UUID | null): Promise<ArticleRow> {
  const slug = slugify((input.titleI18n.vi ?? input.titleI18n.en ?? Object.values(input.titleI18n)[0] ?? 'bai-viet') as string);
  const rows = await query<ArticleRow>(
    `INSERT INTO content.article
       (slug, title_i18n, summary_i18n, body_i18n, cover_url, source, sport_id, event_id, tags,
        author_person_id, author_org_id, status)
     VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,'DRAFT')
     RETURNING id, slug, title_i18n, summary_i18n, body_i18n, cover_url, source, sport_id, event_id,
               tags, author_person_id, author_org_id, status, published_at::text, created_at::text, updated_at::text`,
    [
      slug, JSON.stringify(input.titleI18n),
      input.summaryI18n ? JSON.stringify(input.summaryI18n) : null,
      input.bodyI18n ? JSON.stringify(input.bodyI18n) : null,
      input.coverUrl ?? null, input.source ?? 'ORG',
      input.sportId ?? null, input.eventId ?? null, input.tags ?? null,
      input.authorPersonId ?? null, input.authorOrgId ?? null,
    ]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'article',
    entityId: rows[0].id, action: 'ARTICLE_CREATE', after: { source: rows[0].source },
  });
  return rows[0];
}

/**
 * 기사 수정. i18n 필드는 넘긴 언어 키만 병합한다(다른 언어 보존).
 * 넘기지 않은 필드는 그대로 둔다.
 */
export async function updateArticle(
  id: UUID,
  patch: {
    titleI18n?: I18nText; summaryI18n?: I18nText; bodyI18n?: I18nText;
    coverUrl?: string | null; sportId?: UUID | null; eventId?: UUID | null; tags?: string[] | null;
  },
  actorPersonId?: UUID | null
): Promise<ArticleRow> {
  const rows = await query<ArticleRow>(
    `UPDATE content.article SET
        title_i18n   = CASE WHEN $2::jsonb IS NULL THEN title_i18n   ELSE title_i18n   || $2::jsonb END,
        summary_i18n = CASE WHEN $3::jsonb IS NULL THEN summary_i18n ELSE COALESCE(summary_i18n,'{}'::jsonb) || $3::jsonb END,
        body_i18n    = CASE WHEN $4::jsonb IS NULL THEN body_i18n    ELSE COALESCE(body_i18n,'{}'::jsonb)    || $4::jsonb END,
        cover_url    = COALESCE($5, cover_url),
        sport_id     = COALESCE($6, sport_id),
        event_id     = COALESCE($7, event_id),
        tags         = COALESCE($8, tags),
        updated_at   = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, slug, title_i18n, summary_i18n, body_i18n, cover_url, source, sport_id, event_id,
                tags, author_person_id, author_org_id, status, published_at::text, created_at::text, updated_at::text`,
    [
      id,
      patch.titleI18n ? JSON.stringify(patch.titleI18n) : null,
      patch.summaryI18n ? JSON.stringify(patch.summaryI18n) : null,
      patch.bodyI18n ? JSON.stringify(patch.bodyI18n) : null,
      patch.coverUrl ?? null, patch.sportId ?? null, patch.eventId ?? null, patch.tags ?? null,
    ]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'article',
    entityId: id, action: 'ARTICLE_UPDATE',
  });
  return rows[0];
}

/** 상태 변경 (검수·게시·숨김). PUBLISHED 로 처음 갈 때 published_at 을 찍는다. */
export async function setArticleStatus(id: UUID, status: ArticleStatus, actorPersonId?: UUID | null): Promise<void> {
  await query(
    `UPDATE content.article SET status = $2,
            published_at = CASE WHEN $2 = 'PUBLISHED' AND published_at IS NULL THEN now() ELSE published_at END,
            updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, status]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'article',
    entityId: id, action: `ARTICLE_${status}`,
  });
}

export async function deleteArticle(id: UUID, actorPersonId?: UUID | null): Promise<void> {
  await query(`UPDATE content.article SET deleted_at = now() WHERE id = $1`, [id]);
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'article',
    entityId: id, action: 'ARTICLE_DELETE',
  });
}

/**
 * 기사 검수 요청 — 상태를 REVIEW 로 바꾸고 정식 전자결재선(ARTICLE_REVIEW)에 태운다.
 *
 * form_submission 을 만들어 결재함에 올리고, 그 id 를 기사에 연결한다(review_submission_id).
 * 결재선이 없으면(정의 미시드) 상태만 REVIEW 로 두고 조용히 넘어간다 — 화면은 그대로 동작한다.
 * 승인/반려는 결재함에서 감사기록·SLA와 함께 남고, 편집자는 그 결과를 보고 게시한다.
 */
export async function submitArticleForReview(
  id: UUID,
  actor: { personId?: UUID | null; orgId?: UUID | null }
): Promise<{ submissionId: UUID | null }> {
  const article = await getArticleById(id);
  if (!article) throw new Error('article not found');

  const form = await getForm('ARTICLE_REVIEW');
  if (!form) {
    await setArticleStatus(id, 'REVIEW', actor.personId);
    return { submissionId: null };
  }

  const sub = await queryOne<{ id: UUID }>(
    `INSERT INTO core.form_submission
       (form_id, subject_type, subject_id, submitter_person_id, submitter_org_id, data, status, submitted_at, due_at)
     VALUES ($1,'ARTICLE',$2,$3,$4,$5::jsonb,'SUBMITTED', now(),
             CASE WHEN $6::int IS NULL THEN NULL ELSE now() + ($6 || ' days')::interval END)
     RETURNING id`,
    [
      form.id, id, actor.personId ?? article.author_person_id, actor.orgId ?? article.author_org_id,
      JSON.stringify({ article_id: id, title: article.title_i18n, summary: article.summary_i18n ?? {} }),
      form.sla_days,
    ]
  );
  await query(
    `UPDATE content.article SET status='REVIEW', review_submission_id=$2, updated_at=now() WHERE id=$1`,
    [id, sub!.id]
  );
  await startWorkflow(sub!.id, 'ARTICLE_REVIEW', actor.orgId ?? article.author_org_id);
  await writeAudit({
    actorPersonId: actor.personId ?? null, entitySchema: 'content', entityTable: 'article',
    entityId: id, action: 'ARTICLE_REVIEW', after: { submission: sub!.id },
  });
  return { submissionId: sub!.id };
}

/** 연결된 검수 결재의 현재 상태 (SUBMITTED/IN_REVIEW/APPROVED/REJECTED). 없으면 null. */
export async function getArticleReviewStatus(id: UUID): Promise<string | null> {
  const r = await queryOne<{ status: string }>(
    `SELECT fs.status FROM content.article a
       JOIN core.form_submission fs ON fs.id = a.review_submission_id
      WHERE a.id = $1`,
    [id]
  );
  return r?.status ?? null;
}

// ── 기자 자격 (press credential) ─────────────────────────────────────────────

export type CredentialStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

export interface CredentialRow {
  id: UUID;
  person_id: UUID;
  person_name: string | null;
  media_org_id: UUID | null;
  media_org_name: I18nText | null;
  approved_by_org_id: UUID;
  scope_sport_ids: UUID[] | null;
  credential_no: string | null;
  valid_from: string;
  valid_to: string | null;
  status: string;
  created_at: string;
}

export interface CredentialInput {
  personId: UUID;
  mediaOrgId?: UUID | null;
  approvedByOrgId: UUID;
  scopeSportIds?: UUID[] | null;
  credentialNo?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export async function listPressCredentials(filter: { status?: CredentialStatus } = {}): Promise<CredentialRow[]> {
  return query<CredentialRow>(
    `SELECT c.id, c.person_id, p.full_name AS person_name,
            c.media_org_id, mo.name_i18n AS media_org_name,
            c.approved_by_org_id, c.scope_sport_ids, c.credential_no,
            c.valid_from::text, c.valid_to::text, c.status, c.created_at::text
       FROM content.press_credential c
       JOIN core.person p ON p.id = c.person_id
       LEFT JOIN core.organization mo ON mo.id = c.media_org_id
      WHERE ($1::text IS NULL OR c.status = $1)
      ORDER BY c.created_at DESC`,
    [filter.status ?? null]
  );
}

/** 기자 자격 발급 (승인 결과 기록). 승인 절차 자체는 협회가 오프라인/결재로 판단한다. */
export async function issuePressCredential(input: CredentialInput, actorPersonId?: UUID | null): Promise<CredentialRow> {
  const inserted = await queryOne<{ id: UUID }>(
    `INSERT INTO content.press_credential
       (person_id, media_org_id, approved_by_org_id, scope_sport_ids, credential_no, valid_from, valid_to, status)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::date, CURRENT_DATE), $7, 'ACTIVE') RETURNING id`,
    [
      input.personId, input.mediaOrgId ?? null, input.approvedByOrgId,
      input.scopeSportIds ?? null, input.credentialNo ?? null,
      input.validFrom ?? null, input.validTo ?? null,
    ]
  );
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'press_credential',
    entityId: inserted!.id, action: 'PRESS_ISSUE', after: { person: input.personId },
  });
  const rows = await listPressCredentials();
  return rows.find((r) => r.id === inserted!.id)!;
}

/** 기자 자격 수정(자격번호·유효기간). 상태 변경은 setCredentialStatus 가 따로 한다. */
export async function updatePressCredential(
  id: UUID,
  input: { credentialNo?: string | null; validFrom?: string | null; validTo?: string | null },
  actorPersonId?: UUID | null
): Promise<void> {
  await query(
    `UPDATE content.press_credential
        SET credential_no = $2,
            valid_from = COALESCE($3::date, valid_from),
            valid_to = $4
      WHERE id = $1`,
    [id, input.credentialNo ?? null, input.validFrom ?? null, input.validTo ?? null]
  );
  await writeAudit({ actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'press_credential', entityId: id, action: 'UPDATE' });
}

export async function setCredentialStatus(id: UUID, status: CredentialStatus, actorPersonId?: UUID | null): Promise<void> {
  await query(`UPDATE content.press_credential SET status = $2 WHERE id = $1`, [id, status]);
  await writeAudit({
    actorPersonId: actorPersonId ?? null, entitySchema: 'content', entityTable: 'press_credential',
    entityId: id, action: `PRESS_${status}`,
  });
}
