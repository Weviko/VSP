/**
 * 서식 편집기 왕복 검증.
 *
 * 이 테스트가 확인하는 것은 하나다.
 * "관리자 화면에서 필드를 추가하면, 실제 신청 화면과 서버 검증에 그대로 반영되는가."
 * 이것이 성립해야 협의 피드백을 코드 수정 없이 흡수한다는 전략이 참이 된다.
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';

import {
  query, closePool,
  createForm, getFormById, upsertField, deleteField, reorderFields,
  setFormStatus, cloneFormAsNewVersion, listForms,
  getForm, validateSubmission,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

// 이전 실행 흔적 정리
await query(`DELETE FROM core.form_field WHERE form_id IN
             (SELECT id FROM core.form_definition WHERE code = 'TEST_EDITOR')`);
await query(`DELETE FROM core.form_definition WHERE code = 'TEST_EDITOR'`);

console.log('\n[1] create form');
const f1 = await createForm({
  code: 'TEST_EDITOR',
  titleI18n: { vi: 'Biểu mẫu thử', ko: '테스트 서식' },
  slaDays: 10,
});
check('created as DRAFT', f1.status === 'DRAFT');
check('version starts at 1', f1.version === 1);
check('SLA stored', f1.sla_days === 10);

console.log('\n[2] add fields through the editor path');
await upsertField({
  formId: f1.id, fieldKey: 'full_name',
  labelI18n: { vi: 'Họ và tên' }, dataType: 'text',
  isRequired: true, section: 'identity', sortOrder: 10,
});
await upsertField({
  formId: f1.id, fieldKey: 'gender',
  labelI18n: { vi: 'Giới tính' }, dataType: 'select',
  isRequired: true, section: 'identity', sortOrder: 20,
  options: [
    { value: 'M', label_i18n: { vi: 'Nam' } },
    { value: 'F', label_i18n: { vi: 'Nữ' } },
  ],
});
await upsertField({
  formId: f1.id, fieldKey: 'note',
  labelI18n: { vi: 'Ghi chú' }, dataType: 'textarea',
  isRequired: false, section: 'etc', sortOrder: 30,
});

const withFields = await getFormById(f1.id);
check('3 fields added', withFields?.fields.length === 3, String(withFields?.fields.length));
check('select options stored',
  (withFields?.fields.find((x) => x.field_key === 'gender')?.options ?? []).length === 2);

console.log('\n[3] edit is idempotent (upsert, not duplicate)');
await upsertField({
  formId: f1.id, fieldKey: 'full_name',
  labelI18n: { vi: 'Họ tên đầy đủ' }, dataType: 'text',
  isRequired: true, section: 'identity', sortOrder: 10,
});
const afterEdit = await getFormById(f1.id);
check('still 3 fields (no duplicate)', afterEdit?.fields.length === 3, String(afterEdit?.fields.length));
check('label updated',
  afterEdit?.fields.find((x) => x.field_key === 'full_name')?.label_i18n.vi === 'Họ tên đầy đủ');

console.log('\n[4] reorder');
const ids = afterEdit!.fields.map((f) => f.id).reverse();
await reorderFields(f1.id, ids);
const reordered = await getFormById(f1.id);
check('order reversed', reordered!.fields[0].field_key === 'note',
  reordered!.fields.map((f) => f.field_key).join(','));

console.log('\n[5] activate -> reaches the live form');
await setFormStatus(f1.id, 'ACTIVE');
const live = await getForm('TEST_EDITOR');
check('getForm finds the activated form', live?.id === f1.id);
check('live form carries the fields', live?.fields.length === 3);
check('live form carries SLA', live?.sla_days === 10);

console.log('\n[6] server validation uses the edited definition');
const errsEmpty = validateSubmission(live!, {});
check('required fields detected', errsEmpty.length === 2,
  errsEmpty.map((e) => e.field).join(','));
const errsOk = validateSubmission(live!, { full_name: 'Nguyen Van A', gender: 'M' });
check('valid data passes', errsOk.length === 0, JSON.stringify(errsOk));

console.log('\n[7] new version does not disturb the old one');
const f2 = await cloneFormAsNewVersion(f1.id);
check('version incremented', f2.version === 2);
check('clone starts as DRAFT', f2.status === 'DRAFT');
const cloned = await getFormById(f2.id);
check('fields copied', cloned?.fields.length === 3);

await upsertField({
  formId: f2.id, fieldKey: 'birth_date',
  labelI18n: { vi: 'Ngày sinh' }, dataType: 'date',
  isRequired: true, section: 'identity', sortOrder: 40,
});
const v1 = await getFormById(f1.id);
check('v1 untouched by v2 edit', v1?.fields.length === 3, String(v1?.fields.length));
check('v2 has the new field', (await getFormById(f2.id))?.fields.length === 4);

console.log('\n[8] activating v2 archives v1');
await setFormStatus(f2.id, 'ACTIVE');
const v1After = await getFormById(f1.id);
check('v1 archived', v1After?.status === 'ARCHIVED', v1After?.status);
const liveNow = await getForm('TEST_EDITOR');
check('live form is now v2', liveNow?.id === f2.id);
check('live form has 4 fields', liveNow?.fields.length === 4);

console.log('\n[9] delete field');
const target = (await getFormById(f2.id))!.fields.find((x) => x.field_key === 'note')!;
await deleteField(target.id);
check('field removed', (await getFormById(f2.id))?.fields.length === 3);

console.log('\n[10] listing shows counts');
const list = await listForms();
const rows = list.filter((f) => f.code === 'TEST_EDITOR');
check('both versions listed', rows.length === 2, String(rows.length));
check('field counts present', rows.every((r) => typeof r.field_count === 'number'));

await closePool();
console.log(failed === 0
  ? '\nForm editor round-trip passed — editing the form changes the live form.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
