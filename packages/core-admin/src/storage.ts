/**
 * 파일 저장소.
 *
 * 이식성이 제1 요건이다(로컬 → NAS → 베트남 서버로 두 번 옮길 예정).
 * 그래서 앱 코드는 아래 인터페이스만 알고, 실제 저장 위치는 환경변수가 결정한다.
 *
 *   file://<경로>        로컬 파일시스템 (개발·NAS)
 *   s3://<버킷>          S3 호환 (MinIO·클라우드)
 *
 * 저장 키는 날짜로 나눈다. 한 디렉터리에 파일이 수십만 개 쌓이면
 * 파일시스템이 느려지고 백업도 어려워진다.
 */
import { createHash, randomBytes } from 'node:crypto';
import { query, queryOne, type DbClient } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';

export interface StoredFile {
  key: string;
  size: number;
  checksum: string;
}

export interface StorageDriver {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** 키가 실제로 존재하는지. 중복 제거가 빈 껍데기를 가리키지 않게 하는 데 쓴다. */
  exists(key: string): Promise<boolean>;
}

let driver: StorageDriver | null = null;

/** file:// 로컬 파일시스템 */
async function createFileDriver(root: string): Promise<StorageDriver> {
  const { mkdir, writeFile, readFile, unlink, access } = await import('node:fs/promises');
  const { dirname, resolve, sep } = await import('node:path');
  const base = resolve(process.env.VSP_DATA_ROOT ?? process.cwd(), root);

  /** 경로 탈출 방지. key 에 ../ 가 섞여 들어오면 저장소 밖으로 쓸 수 있다. */
  function safePath(key: string): string {
    const full = resolve(base, key);
    if (full !== base && !full.startsWith(base + sep)) {
      throw new Error('invalid storage key');
    }
    return full;
  }

  return {
    async put(key, data) {
      const full = safePath(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, data);
    },
    async get(key) {
      return readFile(safePath(key));
    },
    async delete(key) {
      await unlink(safePath(key)).catch(() => {});
    },
    async exists(key) {
      try {
        await access(safePath(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * s3:// — MinIO 및 S3 호환 저장소.
 *
 * SDK 는 필요할 때만 불러온다. 개발과 NAS 단계에서는 file:// 로 충분하고,
 * 미리 설치해 두면 번들만 무거워진다.
 * 운영 전환 시점에 `npm install @aws-sdk/client-s3` 한 번이면 된다.
 */
async function createS3Driver(bucket: string): Promise<StorageDriver> {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) throw new Error('S3_ENDPOINT is required for s3:// storage');

  const pkg = '@aws-sdk/client-s3';
  let sdk: {
    S3Client: new (cfg: unknown) => { send(cmd: unknown): Promise<unknown> };
    PutObjectCommand: new (i: unknown) => unknown;
    GetObjectCommand: new (i: unknown) => unknown;
    DeleteObjectCommand: new (i: unknown) => unknown;
    HeadObjectCommand: new (i: unknown) => unknown;
  };
  try {
    sdk = (await import(/* @vite-ignore */ pkg)) as typeof sdk;
  } catch {
    throw new Error(
      's3:// storage requires @aws-sdk/client-s3. Install it or use file:// storage.'
    );
  }
  const {
    S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  } = sdk;
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? process.env.MINIO_USER ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? process.env.MINIO_PASSWORD ?? '',
    },
  });

  return {
    async put(key, data, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType })
      );
    },
    async get(key) {
      const res = (await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      )) as { Body: AsyncIterable<Uint8Array> };
      const chunks: Buffer[] = [];
      for await (const chunk of res.Body) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function getDriver(): Promise<StorageDriver> {
  if (!driver) {
    const url = process.env.STORAGE_URL ?? 'file://.storage';
    driver = url.startsWith('s3://')
      ? await createS3Driver(url.slice(5))
      : await createFileDriver(url.replace(/^file:\/\//, '') || '.storage');
  }
  return driver;
}

/** 허용 확장자. 실행 파일이 올라오면 서버가 위험해진다. */
const ALLOWED = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'hwp', 'txt', 'csv', 'zip',
]);

const MAX_SIZE = Number(process.env.UPLOAD_MAX_BYTES ?? 20 * 1024 * 1024);

export class UploadError extends Error {
  constructor(public code: 'TOO_LARGE' | 'BAD_TYPE' | 'EMPTY', message?: string) {
    super(message ?? code);
  }
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/**
 * 저장 키 생성.
 * owner 종류와 날짜로 나눠 한 디렉터리에 파일이 몰리지 않게 한다.
 */
function makeKey(ownerType: string, fileName: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const rand = randomBytes(8).toString('hex');
  const ext = extensionOf(fileName);
  return `${ownerType.toLowerCase()}/${ymd}/${rand}${ext ? '.' + ext : ''}`;
}

export interface UploadInput {
  ownerType: string;
  ownerId: UUID;
  fileName: string;
  data: Buffer;
  mimeType?: string | null;
  uploadedBy?: UUID | null;
}

export interface AttachmentRow {
  id: UUID;
  owner_type: string;
  owner_id: UUID;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  checksum: string | null;
  created_at: string;
}

/**
 * 첨부 업로드.
 * 같은 내용의 파일이 이미 있으면 다시 저장하지 않고 기존 키를 재사용한다.
 * 협회가 같은 서류를 여러 신청서에 붙이는 일이 흔하기 때문이다.
 */
export async function uploadAttachment(input: UploadInput): Promise<AttachmentRow> {
  if (!input.data || input.data.length === 0) throw new UploadError('EMPTY');
  if (input.data.length > MAX_SIZE) throw new UploadError('TOO_LARGE');

  const ext = extensionOf(input.fileName);
  if (!ALLOWED.has(ext)) throw new UploadError('BAD_TYPE', ext);

  const checksum = createHash('sha256').update(input.data).digest('hex');

  const existing = await queryOne<{ storage_key: string }>(
    `SELECT storage_key FROM core.attachment
      WHERE checksum = $1 AND deleted_at IS NULL LIMIT 1`,
    [checksum]
  );

  // 같은 내용이 이미 있으면 키를 재사용한다. 다만 레코드만 믿지 않고 실제 파일을 확인한다.
  // 저장소 이전이나 부분 복구로 파일이 비면, 레코드를 믿은 업로드는 빈 키를 물려받아
  // 이후 모든 사본이 열리지 않는다. 그 경우 같은 키에 다시 써서 기존 레코드까지 되살린다.
  const d = await getDriver();
  let key: string;
  if (existing && (await d.exists(existing.storage_key))) {
    key = existing.storage_key;
  } else {
    key = existing?.storage_key ?? makeKey(input.ownerType, input.fileName);
    await d.put(key, input.data, input.mimeType ?? undefined);
  }

  const rows = await query<AttachmentRow>(
    `INSERT INTO core.attachment
       (owner_type, owner_id, file_name, mime_type, size_bytes, storage_key, checksum, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      input.ownerType, input.ownerId, input.fileName,
      input.mimeType ?? null, input.data.length, key, checksum,
      input.uploadedBy ?? null,
    ]
  );

  await writeAudit({
    actorPersonId: input.uploadedBy,
    entitySchema: 'core',
    entityTable: 'attachment',
    entityId: rows[0].id,
    action: 'UPLOAD',
    after: {
      file_name: input.fileName,
      size: input.data.length,
      dedup: Boolean(existing),
      storage_key: key,
    },
  });

  return rows[0];
}

/**
 * 임시 첨부의 소유자 확정.
 *
 * 신청서를 쓰는 동안에는 아직 신청서 행이 없다. 그래서 파일은 먼저 DRAFT 로 올라가고,
 * 제출이 성공한 뒤에 그 신청서 소유로 옮겨진다. 제출이 실패하면 DRAFT 로 남아
 * 엉뚱한 신청서에 붙지 않는다.
 *
 * 올린 본인의 DRAFT 만 옮긴다. 이 조건이 없으면 남이 올린 첨부의 id 를 적어 보내는 것만으로
 * 다른 기관의 서류를 자기 신청서에 끌어올 수 있다.
 */
export async function claimAttachments(
  ids: UUID[],
  ownerType: string,
  ownerId: UUID,
  uploadedBy: UUID | null,
  client?: DbClient
): Promise<number> {
  if (ids.length === 0 || !uploadedBy) return 0;
  const sql = `UPDATE core.attachment
                  SET owner_type = $1, owner_id = $2
                WHERE id = ANY($3::uuid[])
                  AND owner_type = 'DRAFT'
                  AND uploaded_by = $4
                  AND deleted_at IS NULL
              RETURNING id`;
  const args = [ownerType, ownerId, ids, uploadedBy];
  if (client) {
    const res = await client.query<{ id: UUID }>(sql, args);
    return res.rows.length;
  }
  const rows = await query<{ id: UUID }>(sql, args);
  return rows.length;
}

export interface AttachmentActor {
  personId: UUID | null;
  /** 소속 조직 id 목록 */
  orgIds: UUID[];
  roleCodes?: string[];
}

/**
 * 첨부를 열어볼 수 있는 사람인지.
 *
 * "로그인했으면 다 받을 수 있다"로 두면 안 된다. 등록 서류에는 신분증과 건강진단서가 붙고,
 * 전국 협회 담당자가 모두 같은 시스템에 로그인한다. 남의 협회 선수 신분증을
 * id 만 알면 받아갈 수 있다면 개인정보보호법(13/2023) 위반이다.
 *
 * 판단 기준은 결재함이 쓰는 것과 같다 — 그 서류를 볼 자격이 있는 사람이 첨부도 본다.
 *   DRAFT       올린 본인만 (아직 어느 서류에도 속하지 않았다)
 *   ORG         그 조직 구성원
 *   SUBMISSION  제출 조직의 구성원, 그리고 그 건의 결재선에 있는 조직
 *   그 외        올린 본인 또는 소유 조직 구성원
 */
export async function canReadAttachment(
  id: UUID,
  actor: AttachmentActor
): Promise<boolean> {
  if (!actor.personId) return false;
  if (actor.roleCodes?.includes('SYS_ADMIN')) return true;

  const row = await queryOne<{ uploaded_by: UUID | null; owner_type: string; owner_id: UUID }>(
    `SELECT uploaded_by, owner_type, owner_id FROM core.attachment
      WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return false;
  if (row.uploaded_by === actor.personId) return true;
  if (row.owner_type === 'DRAFT') return false;
  if (actor.orgIds.includes(row.owner_id)) return true;

  if (row.owner_type === 'SUBMISSION') {
    const hit = await queryOne<{ n: number }>(
      `SELECT 1 AS n
         FROM core.form_submission fs
         LEFT JOIN core.workflow_instance wi ON wi.submission_id = fs.id
         LEFT JOIN core.workflow_step ws ON ws.workflow_id = wi.workflow_id
        WHERE fs.id = $1
          AND (
            fs.submitter_org_id = ANY($2::uuid[])
            OR (ws.approver_type = 'SUBMITTER_ORG_HEAD' AND fs.submitter_org_id = ANY($2::uuid))
            OR (ws.approver_type = 'ROLE_IN_PARENT_ORG'
                AND (SELECT o.parent_id FROM core.organization o
                      WHERE o.id = fs.submitter_org_id) = ANY($2::uuid[]))
            OR (ws.approver_type IN ('ROLE_IN_ORG','SPECIFIC_ORG')
                AND ws.approver_org_id = ANY($2::uuid[]))
          )
        LIMIT 1`,
      [row.owner_id, actor.orgIds]
    );
    return Boolean(hit);
  }

  return false;
}

/** 첨부를 지울 수 있는 사람인지. 올린 본인이거나, 그 첨부를 소유한 조직의 구성원이어야 한다. */
export async function canDeleteAttachment(
  id: UUID,
  user: { personId: UUID | null; orgIds: UUID[] }
): Promise<boolean> {
  if (!user.personId) return false;
  const row = await queryOne<{ uploaded_by: UUID | null; owner_type: string; owner_id: UUID }>(
    `SELECT uploaded_by, owner_type, owner_id FROM core.attachment
      WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (!row) return false;
  if (row.uploaded_by === user.personId) return true;
  return row.owner_type === 'ORG' && user.orgIds.includes(row.owner_id);
}

export async function listAttachments(ownerType: string, ownerId: UUID): Promise<AttachmentRow[]> {
  return query<AttachmentRow>(
    `SELECT * FROM core.attachment
      WHERE owner_type = $1 AND owner_id = $2 AND deleted_at IS NULL
      ORDER BY created_at`,
    [ownerType, ownerId]
  );
}

export async function getAttachment(id: UUID): Promise<AttachmentRow | null> {
  return queryOne<AttachmentRow>(
    `SELECT * FROM core.attachment WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
}

export async function readAttachment(id: UUID): Promise<{ meta: AttachmentRow; data: Buffer } | null> {
  const meta = await getAttachment(id);
  if (!meta) return null;
  const d = await getDriver();
  return { meta, data: await d.get(meta.storage_key) };
}

/**
 * 첨부 삭제.
 * 레코드만 지우고 실제 파일은 남긴다. 같은 파일을 다른 레코드가 참조할 수 있고,
 * 무엇보다 감사 대상 문서의 증빙이 복구 불가능하게 사라지면 안 된다.
 */
export async function deleteAttachment(id: UUID, actor: { personId?: UUID | null } = {}): Promise<void> {
  await query(`UPDATE core.attachment SET deleted_at = now() WHERE id = $1`, [id]);
  await writeAudit({
    actorPersonId: actor.personId,
    entitySchema: 'core',
    entityTable: 'attachment',
    entityId: id,
    action: 'DELETE',
  });
}
