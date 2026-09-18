/**
 * AI 문서 등록 검증.
 *
 * 확인하려는 것:
 *   - 서류가 올라오면 AI(추출기)가 공식 폼 항목을 채운다
 *   - AI 는 초안만 만든다: 신청서·결재는 사람이 확정(confirm)해야 시작된다 (자동 승인 없음)
 *   - 신뢰도 낮은/빈 필수 항목은 검토 대상으로 표시된다
 *   - 추출기가 없으면 아무것도 지어내지 않는다 (빈 초안)
 *   - 확정하면 신청서가 제출되고 전자결재가 시작되며 원본 서류가 증빙으로 연결된다
 */
process.env.DATABASE_URL ??= 'pglite://.pgdata';
process.env.STORAGE_URL ??= 'file://.storage-test';

import {
  query, queryOne, closePool,
  uploadAttachment, getForm,
  registerExtractor, NULL_EXTRACTOR, ingestDocument, confirmIngestion, rejectIngestion,
  lowConfidenceFields, listIngestionQueue, heuristicExtractor,
  createLlmExtractor, llmConfigFromEnv, parseExtraction, buildAnthropicRequest,
  type UUID, type Extractor,
} from '../packages/core-admin/src/index.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

const org = await queryOne<{ id: UUID }>(`SELECT id FROM core.organization WHERE deleted_at IS NULL LIMIT 1`);
if (!org) { console.log('데모 데이터가 필요합니다. npm run demo 먼저.'); process.exit(1); }
let person = await queryOne<{ id: UUID }>(`SELECT id FROM core.person WHERE full_name = 'INGEST_TESTER' LIMIT 1`);
if (!person) {
  person = await queryOne<{ id: UUID }>(
    `INSERT INTO core.person (full_name, phone) VALUES ('INGEST_TESTER', '0900000009') RETURNING id`
  );
}

async function cleanup() {
  const subs = `SELECT id FROM core.form_submission WHERE data->>'id_doc_no' = '001201000123'`;
  await query(`DELETE FROM core.workflow_action WHERE instance_id IN (SELECT id FROM core.workflow_instance WHERE submission_id IN (${subs}))`).catch(() => {});
  await query(`DELETE FROM core.workflow_instance WHERE submission_id IN (${subs})`).catch(() => {});
  await query(`DELETE FROM core.ingestion_job WHERE extractor IN ('stub','none','heuristic-kv') OR extractor LIKE 'llm:%'`);
  await query(`DELETE FROM core.attachment WHERE file_name IN ('don-dang-ky-vdv.pdf','don-2.pdf','don-text.txt','don-llm.txt')`);
  await query(`DELETE FROM core.form_submission WHERE data->>'id_doc_no' = '001201000123'`).catch(() => {});
}

await cleanup();

// 스텁 추출기: 텍스트 항목은 잘 채우고, 사진(file)은 못 만든다(현실과 동일).
// phone 은 일부러 낮은 신뢰도로 둬서 검토 표시가 되는지 본다.
const stub: Extractor = {
  name: 'stub',
  async extract({ form }) {
    const fields: Record<string, unknown> = {
      full_name: 'Nguyễn Văn Ánh',
      name_latin: 'Nguyen Van Anh',
      gender: 'M',
      birth_date: '2001-05-12',
      id_doc_no: '001201000123',
      phone: '0912345678',
      team: org.id,
      discipline: 'KYORUGI',
    };
    const confidence: Record<string, number> = {
      full_name: 0.98, name_latin: 0.97, gender: 0.95, birth_date: 0.93,
      id_doc_no: 0.9, phone: 0.55, team: 0.8, discipline: 0.6,
    };
    // 폼에 없는 항목은 넣지 않는다
    void form;
    return { fields, confidence };
  },
};

console.log('\n[1] 추출 → 초안');
registerExtractor(stub);
const pdf = Buffer.from('%PDF-1.4 giay dang ky VDV (fake scan for test)');
const up = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: person.id,
  fileName: 'don-dang-ky-vdv.pdf', data: pdf, mimeType: 'application/pdf', uploadedBy: person.id,
});
const job = await ingestDocument({
  attachmentId: up.id, formCode: 'ATHLETE_REG',
  subjectType: 'PERSON', submitterPersonId: person.id, submitterOrgId: org.id, locale: 'vi',
});
check('작업이 추출됨 상태', job.status === 'EXTRACTED', job.status);
check('텍스트 항목이 채워짐', job.extracted.full_name === 'Nguyễn Văn Ánh');
check('전체 신뢰도 기록', Number(job.overall_confidence) > 0, String(job.overall_confidence));
check('아직 신청서 없음(자동 제출 안 함)', job.submission_id === null);

const form = await getForm('ATHLETE_REG');
const low = lowConfidenceFields(form!, job.extracted, job.confidence);
check('사진(빈 필수)이 검토 대상', low.includes('photo'), low.join(','));
check('전화(낮은 신뢰도)가 검토 대상', low.includes('phone'), low.join(','));
check('이름(높은 신뢰도)은 검토 대상 아님', !low.includes('full_name'));
check('검증에서 사진 누락 지적', job.validation.some((v) => v.field === 'photo'));

console.log('\n[2] 자동 승인이 없음');
const wfBefore = await queryOne<{ n: number }>(
  `SELECT count(*)::int AS n FROM core.workflow_instance wi
     JOIN core.form_submission fs ON fs.id = wi.submission_id
    WHERE fs.data->>'id_doc_no' = '001201000123'`
);
check('결재가 시작되지 않음', (wfBefore?.n ?? 0) === 0);

console.log('\n[3] 검토 대기 목록');
const queue = await listIngestionQueue(form!.id);
check('큐에 나타남', queue.some((j) => j.id === job.id));

console.log('\n[4] 사람이 확정 → 제출 + 전자결재');
// 사람이 사진을 첨부하고(여기선 값 채움 대체) 확정한다
const corrected = { ...job.extracted, photo: { id: up.id, name: up.file_name } };
const res = await confirmIngestion(job.id, corrected, { personId: person.id, orgId: org.id });
check('신청서 생성', Boolean(res.submissionId));
const sub = await queryOne<{ status: string }>(
  `SELECT status FROM core.form_submission WHERE id = $1`, [res.submissionId]
);
check('신청서가 결재에 올라감', sub?.status === 'SUBMITTED' || sub?.status === 'IN_REVIEW', sub?.status);
const jobAfter = await queryOne<{ status: string; submission_id: UUID | null }>(
  `SELECT status, submission_id FROM core.ingestion_job WHERE id = $1`, [job.id]
);
check('작업이 APPLIED', jobAfter?.status === 'APPLIED' && jobAfter.submission_id === res.submissionId);
const wf = await queryOne<{ n: number }>(
  `SELECT count(*)::int AS n FROM core.workflow_instance WHERE submission_id = $1`, [res.submissionId]
);
check('전자결재가 시작됨', (wf?.n ?? 0) >= 1, String(wf?.n));
const att = await queryOne<{ owner_type: string; owner_id: UUID }>(
  `SELECT owner_type, owner_id FROM core.attachment WHERE id = $1`, [up.id]
);
check('원본 서류가 신청서 증빙으로 연결', att?.owner_type === 'SUBMISSION' && att.owner_id === res.submissionId);

console.log('\n[5] 추출기 없으면 지어내지 않음');
registerExtractor(NULL_EXTRACTOR);
const up2 = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: person.id,
  fileName: 'don-2.pdf', data: Buffer.from('%PDF-1.4 another'), mimeType: 'application/pdf', uploadedBy: person.id,
});
const job2 = await ingestDocument({ attachmentId: up2.id, formCode: 'ATHLETE_REG', submitterPersonId: person.id, submitterOrgId: org.id });
check('빈 초안', Object.keys(job2.extracted).length === 0);
check('필수 항목들이 검증에서 지적', job2.validation.some((v) => v.field === 'full_name' && v.code === 'REQUIRED'));

console.log('\n[6] 반려');
await rejectIngestion(job2.id, { personId: person.id });
const j2 = await queryOne<{ status: string }>(`SELECT status FROM core.ingestion_job WHERE id = $1`, [job2.id]);
check('반려됨', j2?.status === 'REJECTED');

console.log('\n[7] 기본(휴리스틱) 추출기 — 서류에 적힌 텍스트만 옮긴다');
registerExtractor(heuristicExtractor);
// 텍스트 서류: 'field_key: value' 줄. 실제로 적힌 값만 옮겨야 한다(지어내지 않음).
const textDoc = [
  'full_name: Nguyễn Văn Ánh',
  'name_latin: Nguyen Van Anh',
  'gender: M',
  'birth_date: 2001-05-12',
  'id_doc_no: 001201000999',
  'phone: 0912345678',
  'ghi chú: không liên quan', // 폼에 없는 줄 → 무시돼야 한다
].join('\n');
const upT = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: person.id,
  fileName: 'don-text.txt', data: Buffer.from(textDoc, 'utf8'), mimeType: 'text/plain', uploadedBy: person.id,
});
const jobT = await ingestDocument({
  attachmentId: upT.id, formCode: 'ATHLETE_REG',
  subjectType: 'PERSON', submitterPersonId: person.id, submitterOrgId: org.id, locale: 'vi',
});
check('추출기 이름이 heuristic-kv', jobT.extractor === 'heuristic-kv', String(jobT.extractor));
check('서류의 이름을 그대로 옮김', jobT.extracted.full_name === 'Nguyễn Văn Ánh', String(jobT.extracted.full_name));
check('날짜 형식 유지', jobT.extracted.birth_date === '2001-05-12', String(jobT.extracted.birth_date));
check('항목 키 매칭은 임계값 이상 신뢰도', Number(jobT.confidence.full_name) >= 0.8, String(jobT.confidence.full_name));
check('폼에 없는 내용은 옮기지 않음', !('ghi chú' in jobT.extracted) && !('note' in jobT.extracted));
check('빈 필수(사진)는 여전히 검토 대상', lowConfidenceFields(form!, jobT.extracted, jobT.confidence).includes('photo'));
// 스캔 이미지(바이너리)는 글자를 못 읽으므로 아무것도 옮기지 않는다
const upBin = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: person.id,
  fileName: 'don-2.pdf', data: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02, 0x00]), mimeType: 'application/pdf', uploadedBy: person.id,
});
const jobBin = await ingestDocument({ attachmentId: upBin.id, formCode: 'ATHLETE_REG', submitterPersonId: person.id, submitterOrgId: org.id });
check('바이너리 서류는 빈 초안', Object.keys(jobBin.extracted).length === 0);

console.log('\n[8] LLM 추출기 어댑터 (네트워크 없이 모의 응답으로)');
// 설정: 키가 없으면 null(→ 기본 추출기 폴백), 있으면 설정을 만든다
check('키 없으면 설정 없음(폴백)', llmConfigFromEnv({} as NodeJS.ProcessEnv) === null);
check('키 있으면 설정 생성', llmConfigFromEnv({ VSP_LLM_API_KEY: 'x', VSP_LLM_MODEL: 'm' } as unknown as NodeJS.ProcessEnv)?.model === 'm');

// 순수 파서: 코드펜스·잡텍스트·폼밖 항목·신뢰도 범위초과를 견딘다
const parsed = parseExtraction(
  'Here you go:\n```json\n{"fields":{"full_name":"Trần Văn B","phone":"0900","not_a_field":"x"},"confidence":{"full_name":0.9,"phone":1.7}}\n```',
  form!
);
check('파서: 폼 항목만 남김', parsed.fields.full_name === 'Trần Văn B' && !('not_a_field' in parsed.fields));
check('파서: 신뢰도 0~1 로 클램프', parsed.confidence.phone === 1 && parsed.confidence.full_name === 0.9);
check('파서: 깨진 응답은 빈 결과', Object.keys(parseExtraction('sorry, no json here', form!).fields).length === 0);

// 요청 빌더: 텍스트는 요청 생성, 바이너리는 null
const txtInput = { data: Buffer.from('full name: X'), mimeType: 'text/plain', fileName: 'a.txt', form: form!, locale: 'vi' as const };
const reqBody = buildAnthropicRequest(form!, txtInput, { model: 'm', maxTokens: 512 });
check('요청 빌더: 모델·시스템 포함', (reqBody as { model?: string })?.model === 'm' && typeof (reqBody as { system?: string })?.system === 'string');
const binInput = { data: Buffer.from([0x00, 0x01, 0x02]), mimeType: 'application/octet-stream', fileName: 'b.bin', form: form!, locale: 'vi' as const };
check('요청 빌더: 읽을 수 없는 형식은 null', buildAnthropicRequest(form!, binInput, { model: 'm', maxTokens: 512 }) === null);

// 전체 경로: 모의 fetch 로 Anthropic 응답을 주입해 추출까지 확인 (네트워크 없음)
const mockFetch = (async () =>
  new Response(
    JSON.stringify({
      content: [{ type: 'text', text: '{"fields":{"full_name":"Lê Thị C","gender":"F","birth_date":"1999-02-03"},"confidence":{"full_name":0.95,"gender":0.8,"birth_date":0.7}}' }],
    }),
    { status: 200 }
  )) as unknown as typeof fetch;
registerExtractor(createLlmExtractor({
  apiKey: 'test-key', model: 'test-model', baseUrl: 'https://example.invalid',
  anthropicVersion: '2023-06-01', maxTokens: 512, fetchImpl: mockFetch,
}));
const upLlm = await uploadAttachment({
  ownerType: 'DRAFT', ownerId: person.id,
  fileName: 'don-llm.txt', data: Buffer.from('Đơn đăng ký (nội dung tự do)', 'utf8'), mimeType: 'text/plain', uploadedBy: person.id,
});
const jobLlm = await ingestDocument({ attachmentId: upLlm.id, formCode: 'ATHLETE_REG', submitterPersonId: person.id, submitterOrgId: org.id, locale: 'vi' });
check('LLM 추출기 이름 기록', jobLlm.extractor === 'llm:test-model', String(jobLlm.extractor));
check('모의 LLM 응답으로 폼이 채워짐', jobLlm.extracted.full_name === 'Lê Thị C' && jobLlm.extracted.gender === 'F');
check('여전히 자동 제출 안 함', jobLlm.submission_id === null && jobLlm.status === 'EXTRACTED');

await cleanup();
await query(`DELETE FROM core.person WHERE full_name = 'INGEST_TESTER'`).catch(() => {});
await closePool();
const { rm } = await import('node:fs/promises');
await rm('.storage-test', { recursive: true, force: true }).catch(() => {});

console.log(failed === 0
  ? '\nAI 가 공식 폼을 채우고, 사람이 확정해야 결재가 시작된다.\n'
  : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
