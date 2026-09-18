/**
 * LLM 추출기 어댑터 — 순수 로직 검증 (DB·네트워크 없음).
 *
 * 프롬프트 구성·응답 파싱·설정 읽기·모의 호출까지 메모리 최소로 확인한다.
 * (통합 경로는 test-ingest.mts [8] 이 ingestDocument 로 다시 확인한다.)
 */
import {
  llmConfigFromEnv, buildFieldSpec, buildAnthropicRequest, parseExtraction, createLlmExtractor,
} from '../packages/core-admin/src/extractors/llm.ts';
import type { FormWithFields } from '../packages/core-admin/src/form-schema.ts';

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${name}${cond || !detail ? '' : ' — ' + detail}`);
  if (!cond) failed++;
}

// 최소 폼 (buildFieldSpec/parseExtraction 이 쓰는 필드만 채운 가짜)
const form = {
  id: 'form-1', code: 'ATHLETE_REG', fields: [
    { field_key: 'full_name', label_i18n: { vi: 'Họ và tên' }, data_type: 'text', is_required: true, options: null },
    { field_key: 'gender', label_i18n: { vi: 'Giới tính' }, data_type: 'select', is_required: false,
      options: [{ value: 'M', label_i18n: {} }, { value: 'F', label_i18n: {} }] },
    { field_key: 'birth_date', label_i18n: { vi: 'Ngày sinh' }, data_type: 'date', is_required: false, options: null },
  ],
} as unknown as FormWithFields;

const cfg = { model: 'm', maxTokens: 512 };
const textInput = { data: Buffer.from('nội dung tự do'), mimeType: 'text/plain', fileName: 'a.txt', form, locale: 'vi' as const };

console.log('\n[1] 설정 (환경변수)');
check('키 없으면 null (기본 추출기 폴백)', llmConfigFromEnv({} as NodeJS.ProcessEnv) === null);
check('키 있으면 설정 생성', llmConfigFromEnv({ VSP_LLM_API_KEY: 'x', VSP_LLM_MODEL: 'm' } as unknown as NodeJS.ProcessEnv)?.model === 'm');
check('ANTHROPIC_API_KEY 도 인식', llmConfigFromEnv({ ANTHROPIC_API_KEY: 'y' } as unknown as NodeJS.ProcessEnv) !== null);
check('base URL 끝 슬래시 정리', llmConfigFromEnv({ VSP_LLM_API_KEY: 'x', VSP_LLM_BASE_URL: 'https://h/' } as unknown as NodeJS.ProcessEnv)?.baseUrl === 'https://h');

console.log('\n[2] 필드 명세');
const spec = buildFieldSpec(form, 'vi');
check('항목 키·라벨·타입 포함', spec[0].key === 'full_name' && spec[0].label === 'Họ và tên' && spec[0].required === true);
check('select 선택지 포함', JSON.stringify(spec[1].options) === JSON.stringify(['M', 'F']));

console.log('\n[3] 응답 파서');
const p = parseExtraction(
  'Sure:\n```json\n{"fields":{"full_name":"Trần Văn B","gender":"F","not_a_field":"x"},"confidence":{"full_name":0.9,"gender":1.7}}\n```',
  form
);
check('폼 항목만 남김 (폼밖 제거)', p.fields.full_name === 'Trần Văn B' && !('not_a_field' in p.fields));
check('신뢰도 0~1 클램프', p.confidence.gender === 1 && p.confidence.full_name === 0.9);
check('빈 값은 담지 않음', parseExtraction('{"fields":{"full_name":""}}', form).fields.full_name === undefined);
check('깨진 응답은 빈 결과', Object.keys(parseExtraction('no json', form).fields).length === 0);
check('값 없는 항목의 신뢰도는 버림', Object.keys(parseExtraction('{"fields":{},"confidence":{"gender":0.9}}', form).confidence).length === 0);

console.log('\n[4] 요청 빌더 (문서 블록)');
const rq = buildAnthropicRequest(form, textInput, cfg) as { model?: string; system?: string; messages?: Array<{ content: Array<{ type: string }> }> };
check('텍스트: 모델·시스템·메시지', rq?.model === 'm' && typeof rq?.system === 'string' && Array.isArray(rq?.messages));
check('텍스트: 문서를 text 블록으로', rq?.messages?.[0].content.some((c) => c.type === 'text') === true);
const img = buildAnthropicRequest(form, { ...textInput, data: Buffer.from([1, 2]), mimeType: 'image/png', fileName: 'x.png' }, cfg) as { messages?: Array<{ content: Array<{ type: string }> }> };
check('이미지: image 블록', img?.messages?.[0].content.some((c) => c.type === 'image') === true);
const pdf = buildAnthropicRequest(form, { ...textInput, data: Buffer.from([1, 2]), mimeType: 'application/pdf', fileName: 'x.pdf' }, cfg) as { messages?: Array<{ content: Array<{ type: string }> }> };
check('PDF: document 블록', pdf?.messages?.[0].content.some((c) => c.type === 'document') === true);
check('읽을 수 없는 형식은 null', buildAnthropicRequest(form, { ...textInput, data: Buffer.from([0, 1, 2]), mimeType: 'application/octet-stream', fileName: 'b.bin' }, cfg) === null);

console.log('\n[5] 전체 추출 (모의 fetch — 네트워크 없음)');
let sentUrl = '';
let sentAuth = '';
const mockFetch = (async (url: string, init: { headers: Record<string, string> }) => {
  sentUrl = url; sentAuth = init.headers['x-api-key'];
  return new Response(JSON.stringify({
    content: [{ type: 'text', text: '{"fields":{"full_name":"Lê Thị C","gender":"F"},"confidence":{"full_name":0.95,"gender":0.8}}' }],
  }), { status: 200 });
}) as unknown as typeof fetch;
const ex = createLlmExtractor({ apiKey: 'secret', model: 'test-model', baseUrl: 'https://example.invalid', anthropicVersion: '2023-06-01', maxTokens: 512, fetchImpl: mockFetch });
check('추출기 이름에 모델 포함', ex.name === 'llm:test-model');
const out = await ex.extract(textInput);
check('모의 응답으로 폼이 채워짐', out.fields.full_name === 'Lê Thị C' && out.fields.gender === 'F');
check('신뢰도 전달', out.confidence.full_name === 0.95);
check('올바른 종단점 호출', sentUrl === 'https://example.invalid/v1/messages');
check('API 키를 헤더로 전달', sentAuth === 'secret');

const errFetch = (async () => new Response('rate limit', { status: 429 })) as unknown as typeof fetch;
const exErr = createLlmExtractor({ apiKey: 's', model: 'm', baseUrl: 'https://x', anthropicVersion: '2023-06-01', maxTokens: 512, fetchImpl: errFetch });
let threw = false;
try { await exErr.extract(textInput); } catch { threw = true; }
check('API 오류는 예외로 (→ 작업 FAILED)', threw);

console.log(failed === 0 ? '\nLLM 추출기: 문서→구조화·안전 파싱·키 폴백 OK\n' : `\n${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
