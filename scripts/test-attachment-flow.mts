/**
 * 첨부 → 신청서 흐름 검증.
 *
 * 여기서 막으려는 사고는 하나다: 서류를 낸 것처럼 보이는데 실제로는 아무것도 없는 신청서.
 * 결재는 첨부를 근거로 통과하므로, 첨부가 비어 있으면 감사에서 뒤늦게 드러난다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage-test';

import {
  query, queryOne, closePool,
  uploadAttachment, claimAttachments, canDeleteAttachment, canReadAttachment, getMyOrgIds,
  getForm, validateSubmission, submitForm, attachmentIdsIn, isFileValue,
  type UUID,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

const org = await queryOne<{ id: UUID }>(`SELECT id FROM core.organization LIMIT 1`);
const me = await queryOne<{ id: UUID }>(`SELECT id FROM core.person LIMIT 1`);
const other = await queryOne<{ id: UUID }>(
  `SELECT id FROM core.person WHERE id <> $1 LIMIT 1`, [me?.id]
);
if (!org || !me || !other) {
  console.log('데모 데이터가 필요합니다. npm run demo 를 먼저 실행하세요.');
  process.exit(1);
}

await query(`DELETE FROM core.attachment WHERE file_name LIKE 'attach-test%'`);

console.log('\n[1] 첨부 값 판별');
check('파일명 문자열은 첨부가 아니다', !isFileValue('giay-phep.pdf'));
check('id 없는 객체는 첨부가 아니다', !isFileValue({ name: 'a.pdf' }));
check('uuid 가 아니면 첨부가 아니다', !isFileValue({ id: 'abc', name: 'a.pdf' }));
check('id + name 이면 첨부다', isFileValue({ id: crypto.randomUUID(), name: 'a.pdf' }));

console.log('\n[2] 임시 첨부 → 신청서 소유로 이동');
const draft = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: me.id,
  fileName: 'attach-test-giay-phep.pdf',
  data: Buffer.from('%PDF-1.4 attachment flow test'),
  mimeType: 'application/pdf',
  uploadedBy: me.id,
});
check('임시 상태로 올라감', draft.owner_type === 'DRAFT');

const form = await getForm('ATHLETE_REG');
check('서식 조회', Boolean(form));

if (form) {
  const fileField = form.fields.find((f) => f.data_type === 'file');
  check('서식에 첨부 필드가 있음', Boolean(fileField), form.fields.map((f) => f.data_type).join(','));

  if (fileField) {
    const data: Record<string, unknown> = {};
    for (const f of form.fields) {
      if (f.is_required && f.data_type !== 'file') {
        data[f.field_key] =
          f.data_type === 'number' ? 1
          : f.data_type === 'date' ? '2000-01-01'
          : f.data_type === 'checkbox' ? true
          : f.data_type === 'org' ? org.id
          : f.data_type === 'select' ? (f.options?.[0]?.value ?? 'X')
          : f.field_key.includes('phone') ? '0901234567'
          : f.field_key.includes('email') ? 'test@example.vn'
          : 'test';
      }
    }
    data[fileField.field_key] = { id: draft.id, name: draft.file_name, size: draft.size_bytes };

    check('첨부 id 를 서식에서 뽑아냄', attachmentIdsIn(form, data)[0] === draft.id);
    check('검증 통과', validateSubmission(form, data).length === 0,
      JSON.stringify(validateSubmission(form, data)));

    const sub = await submitForm({
      formId: form.id,
      subjectType: 'PERSON',
      submitterPersonId: me.id,
      submitterOrgId: org.id,
      attachmentIds: attachmentIdsIn(form, data) as UUID[],
      data,
    });
    const moved = await queryOne<{ owner_type: string; owner_id: UUID }>(
      `SELECT owner_type, owner_id FROM core.attachment WHERE id = $1`, [draft.id]
    );
    check('첨부가 신청서 소유로 옮겨짐',
      moved?.owner_type === 'SUBMISSION' && moved.owner_id === sub.id,
      JSON.stringify(moved));

    // 파일명만 담긴 값은 "냈다고 적혀 있으나 실물이 없는" 서류다
    const fake = { ...data, [fileField.field_key]: 'giay-phep.pdf' };
    const fakeErrors = validateSubmission(form, fake);
    check('파일명 문자열은 반려', fakeErrors.some((e) => e.code === 'FILE'));

    // 남이 올린 첨부 id 를 끼워 넣어도 내 신청서에 붙지 않는다
    const stolen = await uploadAttachment({
      ownerType: 'DRAFT', ownerId: other.id,
      fileName: 'attach-test-other.pdf',
      data: Buffer.from('%PDF-1.4 belongs to someone else'),
      uploadedBy: other.id,
    });
    let blocked = false;
    try {
      await submitForm({
        formId: form.id,
        subjectType: 'PERSON',
        submitterPersonId: me.id,
        submitterOrgId: org.id,
        attachmentIds: [stolen.id],
        data: { ...data, [fileField.field_key]: { id: stolen.id, name: stolen.file_name } },
      });
    } catch (e) {
      blocked = e instanceof Error && e.message === 'ATTACHMENT_NOT_CLAIMED';
    }
    check('남의 첨부는 끌어올 수 없음', blocked);
    const untouched = await queryOne<{ owner_id: UUID }>(
      `SELECT owner_id FROM core.attachment WHERE id = $1`, [stolen.id]
    );
    check('남의 첨부는 그대로 남음', untouched?.owner_id === other.id);
  }
}

console.log('\n[3] 열람 권한');
const secret = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: other.id,
  fileName: 'attach-test-cccd.jpg',
  data: Buffer.from('fake id card scan'),
  uploadedBy: other.id,
});
check('올린 본인은 볼 수 있음',
  await canReadAttachment(secret.id, { personId: other.id, orgIds: [] }));
check('임시 첨부는 남이 볼 수 없음',
  !(await canReadAttachment(secret.id, { personId: me.id, orgIds: await getMyOrgIds(me.id) })));
check('로그인만으로는 볼 수 없음',
  !(await canReadAttachment(secret.id, { personId: null, orgIds: [] })));
check('없는 첨부는 거절',
  !(await canReadAttachment(crypto.randomUUID() as UUID, { personId: me.id, orgIds: [] })));
check('시스템 관리자는 볼 수 있음',
  await canReadAttachment(secret.id, { personId: me.id, orgIds: [], roleCodes: ['SYS_ADMIN'] }));

console.log('\n[4] 삭제 권한');
const mine = await uploadAttachment({
  ownerType: 'ORG', ownerId: org.id,
  fileName: 'attach-test-org.pdf',
  data: Buffer.from('%PDF-1.4 org document'),
  uploadedBy: other.id,
});
const myOrgs = await getMyOrgIds(me.id);
check('올린 본인은 지울 수 있음',
  await canDeleteAttachment(mine.id, { personId: other.id, orgIds: [] }));
check('소속 조직 구성원은 지울 수 있음',
  (await canDeleteAttachment(mine.id, { personId: me.id, orgIds: myOrgs })) === myOrgs.includes(org.id),
  `orgs=${myOrgs.length}`);
check('무관한 사람은 지울 수 없음',
  !(await canDeleteAttachment(mine.id, { personId: me.id, orgIds: [] })));
check('로그인하지 않으면 지울 수 없음',
  !(await canDeleteAttachment(mine.id, { personId: null, orgIds: [] })));

// 이미 확정된 첨부는 임시가 아니므로 다시 옮겨지지 않는다
const reclaimed = await claimAttachments([mine.id], 'SUBMISSION', org.id, other.id);
check('확정된 첨부는 다시 옮겨지지 않음', reclaimed === 0);

await query(`DELETE FROM core.attachment WHERE file_name LIKE 'attach-test%'`);
await closePool();

const { rm } = await import('node:fs/promises');
await rm('.storage-test', { recursive: true, force: true }).catch(() => {});

console.log(failed === 0
  ? '\n첨부가 실제로 저장되고, 남의 첨부는 붙지 않는다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
