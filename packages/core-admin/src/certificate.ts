/**
 * 증명서 발급과 진위확인.
 *
 * 대한체육회는 발급뿐 아니라 **증명서 검증**을 별도 메뉴로 둔다.
 * 위조가 실제로 일어나기 때문이다. 대회 현장에서 종이 한 장을 보고
 * 출전을 허용해야 하는 상황에서, 검증 수단이 없으면 제도가 무너진다.
 *
 * 그래서 발급 시 짧은 검증코드를 부여하고, 로그인 없이 조회할 수 있게 한다.
 * 조회 결과에는 사람 이름과 유효 여부만 보이고 개인정보는 내보내지 않는다.
 */
import { randomBytes } from 'node:crypto';
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export type CertificateType =
  | 'ATHLETE_REG'          // 선수 등록 증명
  | 'COACH_REG'            // 지도자 등록 증명
  | 'REFEREE_REG'          // 심판 등록 증명
  | 'CAREER'               // 경력 증명
  | 'AWARD'                // 수상 증명
  | 'COACH_QUALIFICATION'  // 지도자 국가자격증
  | 'ANTIDOPING_EDU'       // 도핑방지 교육 이수증
  | 'ANTIDOPING_TUE'       // 치료목적 사용면책 승인서
  | 'NATIONAL_TEAM';       // 국가대표 확인서

export interface Certificate {
  id: UUID;
  doc_no: string;
  title: string;
  doc_type: string;
  verify_code: string;
  issued_at: string | null;
  from_org_id: UUID | null;
  created_at: string;
  revoked_at?: string | null;
}

export interface CertificateRow extends Certificate {
  org_name: I18nText | null;
  subject_name: string | null;
}

/** 사람이 전화로 불러줄 수 있도록 짧고 혼동 없는 코드 (0/O, 1/I 제외) */
function makeVerifyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[buf[i] % alphabet.length];
    if (i === 3 || i === 6) out += '-';
  }
  return out;
}

function makeDocNo(prefix: string): string {
  const d = new Date();
  const ymd =
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${ymd}-${rand}`;
}

export interface IssueCertificateInput {
  personId: UUID;
  orgId: UUID | null;
  certType: CertificateType;
  title: string;
  body?: string | null;
  retentionYears?: number;
}

/**
 * 증명서 발급.
 * 발급 사실은 감사로그에 남는다. 누가 언제 무엇을 발급했는지가
 * 나중에 분쟁에서 쟁점이 되기 때문이다.
 */
export async function issueCertificate(
  input: IssueCertificateInput,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<Certificate> {
  return tx(async (client) => {
    const res = await client.query<Certificate>(
      `INSERT INTO core.document
         (doc_no, from_org_id, title, body, doc_type, confidentiality,
          retention_years, verify_code, issued_at)
       VALUES ($1,$2,$3,$4,$5,'PUBLIC',$6,$7, now())
       RETURNING id, doc_no, title, doc_type, verify_code, issued_at, from_org_id, created_at`,
      [
        makeDocNo('CERT'),
        input.orgId,
        input.title,
        input.body ?? null,
        input.certType,
        input.retentionYears ?? 10,
        makeVerifyCode(),
      ]
    );
    const cert = res.rows[0];

    // 발급 대상을 연결해 둔다 (증명서 목록에서 누구 것인지 보여주기 위해)
    await client.query(
      `INSERT INTO core.attachment (owner_type, owner_id, file_name, storage_key, uploaded_by)
       VALUES ('DOCUMENT', $1, $2, $3, $4)`,
      [cert.id, 'subject', `person:${input.personId}`, actor.personId ?? null]
    );

    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'document', entityId: cert.id,
        action: 'ISSUE_CERTIFICATE',
        after: { doc_no: cert.doc_no, type: input.certType, person_id: input.personId },
      },
      client
    );
    return cert;
  });
}

/**
 * 증명서 취소(무효화). 지우지 않고 revoked_at 를 찍는다 — 진위확인에서 '취소됨'으로 노출된다.
 * 잘못 발급했거나 자격이 사라진 경우에 쓴다. 사유는 감사기록과 문서에 남긴다.
 */
export async function revokeCertificate(
  certId: UUID,
  reason: string | null,
  actor: { personId?: UUID | null; orgId?: UUID | null } = {}
): Promise<void> {
  await tx(async (client) => {
    const before = (await client.query(`SELECT * FROM core.document WHERE id=$1`, [certId])).rows[0];
    if (!before) return;
    await client.query(
      `UPDATE core.document SET revoked_at = now(), revoke_reason = $2 WHERE id = $1 AND revoked_at IS NULL`,
      [certId, reason]
    );
    await writeAudit(
      {
        actorPersonId: actor.personId, actorOrgId: actor.orgId,
        entitySchema: 'core', entityTable: 'document', entityId: certId,
        action: 'REVOKE_CERTIFICATE', before, after: { revoked_at: 'now()', reason }, note: reason,
      },
      client
    );
  });
}

export async function listCertificates(orgId?: UUID | null, limit = 100): Promise<CertificateRow[]> {
  return query<CertificateRow>(
    `SELECT d.id, d.doc_no, d.title, d.doc_type, d.verify_code, d.issued_at,
            d.from_org_id, d.created_at, d.revoked_at::text AS revoked_at,
            o.name_i18n AS org_name,
            (SELECT p.full_name FROM core.attachment a
               JOIN core.person p ON ('person:' || p.id) = a.storage_key
              WHERE a.owner_type='DOCUMENT' AND a.owner_id = d.id
              LIMIT 1) AS subject_name
       FROM core.document d
       LEFT JOIN core.organization o ON o.id = d.from_org_id
      WHERE d.verify_code IS NOT NULL
        AND ($1::uuid IS NULL OR d.from_org_id = $1)
      ORDER BY d.issued_at DESC NULLS LAST
      LIMIT $2`,
    [orgId ?? null, limit]
  );
}

export interface VerificationResult {
  valid: boolean;
  revoked?: boolean;
  docNo?: string;
  title?: string;
  issuedAt?: string | null;
  orgName?: I18nText | null;
  subjectName?: string | null;
}

/**
 * 진위확인 (로그인 불필요).
 * 존재 여부와 최소 정보만 돌려준다. 코드가 유출돼도 개인정보가 새지 않아야 한다.
 */
export async function verifyCertificate(code: string): Promise<VerificationResult> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,20}$/.test(normalized)) return { valid: false };

  const row = await queryOne<{
    doc_no: string;
    title: string;
    issued_at: string | null;
    org_name: I18nText | null;
    subject_name: string | null;
    revoked: boolean;
  }>(
    `SELECT d.doc_no, d.title, d.issued_at, o.name_i18n AS org_name,
            (SELECT p.full_name FROM core.attachment a
               JOIN core.person p ON ('person:' || p.id) = a.storage_key
              WHERE a.owner_type='DOCUMENT' AND a.owner_id = d.id
              LIMIT 1) AS subject_name,
            (d.revoked_at IS NOT NULL) AS revoked
       FROM core.document d
       LEFT JOIN core.organization o ON o.id = d.from_org_id
      WHERE d.verify_code = $1 AND d.issued_at IS NOT NULL`,
    [normalized]
  );

  if (!row) return { valid: false };
  return {
    valid: true,
    revoked: row.revoked,
    docNo: row.doc_no,
    title: row.title,
    issuedAt: row.issued_at,
    orgName: row.org_name,
    subjectName: row.subject_name,
  };
}
