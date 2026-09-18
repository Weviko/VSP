/**
 * LLM 추출기 어댑터 — 서류를 읽어 공식 폼 항목을 채운다(문서→구조화).
 *
 * 휴리스틱 추출기(문서에 적힌 텍스트만)와 달리, 라벨이 없는 산문·스캔 이미지·PDF 에서도
 * 문맥으로 값을 찾는다. 다만 원칙은 같다: **문서에 근거가 있는 값만**, 지어내지 않는다.
 * AI 는 초안만 만들고 사람이 확정한다(ingestDocument 은 자동 제출하지 않는다).
 *
 * 공급자 무관: 지금은 Anthropic Messages API 형태로 호출한다. 키·모델은 환경변수로 주입하고
 * (VSP_LLM_API_KEY / VSP_LLM_MODEL …), 키가 없으면 등록되지 않아 안전 기본 추출기로 폴백한다.
 * 프롬프트 구성·응답 파싱은 순수 함수라 네트워크 없이 검증한다.
 */
import type { Extractor, ExtractInput, ExtractionResult } from '../ingest';
import type { FormWithFields } from '../form-schema';
import { t as pickI18n, type Locale } from '../i18n';

export interface LlmConfig {
  apiKey: string;
  model: string;
  baseUrl: string;           // 예: https://api.anthropic.com
  anthropicVersion: string;  // 예: 2023-06-01
  maxTokens: number;
  /** 테스트·대체 구현용. 없으면 전역 fetch 를 쓴다. */
  fetchImpl?: typeof fetch;
}

/** 환경변수에서 설정을 읽는다. 키가 없으면 null (→ 등록 안 함 → 기본 추출기 폴백). */
export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env.VSP_LLM_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: env.VSP_LLM_MODEL ?? 'claude-sonnet-5',
    baseUrl: (env.VSP_LLM_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, ''),
    anthropicVersion: env.VSP_LLM_ANTHROPIC_VERSION ?? '2023-06-01',
    maxTokens: Number(env.VSP_LLM_MAX_TOKENS ?? '2048'),
  };
}

/** 폼 항목을 모델에 넘길 간결한 명세로. */
export function buildFieldSpec(
  form: FormWithFields,
  locale: Locale
): Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }> {
  return form.fields.map((f) => {
    const spec: { key: string; label: string; type: string; required: boolean; options?: string[] } = {
      key: f.field_key,
      label: pickI18n(f.label_i18n, locale),
      type: f.data_type,
      required: f.is_required,
    };
    if (f.options && f.options.length) spec.options = f.options.map((o) => o.value);
    return spec;
  });
}

/** 문서를 모델에 보낼 content 블록으로. 텍스트/이미지/PDF 지원, 그 외는 null. */
function docBlock(input: ExtractInput): Record<string, unknown> | null {
  const mime = input.mimeType ?? '';
  if (mime.startsWith('image/')) {
    return { type: 'image', source: { type: 'base64', media_type: mime, data: input.data.toString('base64') } };
  }
  if (mime === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.data.toString('base64') } };
  }
  // 텍스트로 읽히면 텍스트 블록. 바이너리(널 바이트)면 포기.
  const head = input.data.subarray(0, 1024);
  const textual = mime.startsWith('text/') || mime === 'application/json' || mime.includes('csv') || !head.includes(0);
  if (!textual) return null;
  return { type: 'text', text: `<document filename="${input.fileName}">\n${input.data.toString('utf8')}\n</document>` };
}

const SYSTEM = [
  'You extract data from an uploaded document into the fields of an official form.',
  'Rules:',
  '- Fill a field ONLY when the document gives a basis for it. Never invent or guess values.',
  '- Omit any field you cannot find. Do not include fields that are not in the provided list.',
  '- For select/multiselect fields, return one of the given option values (or an array for multiselect).',
  '- Dates as YYYY-MM-DD. Numbers as plain numbers. Checkboxes as true/false.',
  'Respond with ONLY a JSON object of the shape {"fields": {<key>: <value>}, "confidence": {<key>: <0..1>}}.',
  'confidence is your certainty per field (1 = explicit in the document, lower = inferred).',
].join('\n');

/** Anthropic Messages API 요청 본문을 만든다 (순수 함수). */
export function buildAnthropicRequest(
  form: FormWithFields,
  input: ExtractInput,
  cfg: Pick<LlmConfig, 'model' | 'maxTokens'>
): Record<string, unknown> | null {
  const block = docBlock(input);
  if (!block) return null;
  const spec = buildFieldSpec(form, input.locale);
  const instruction =
    `Form fields (JSON):\n${JSON.stringify(spec)}\n\n` +
    `Extract these fields from the document below. Return the JSON object described in the system prompt.`;
  return {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, block] }],
  };
}

/** 모델 응답 텍스트에서 {fields, confidence} 를 안전하게 뽑는다 (순수 함수). */
export function parseExtraction(raw: string, form: FormWithFields): ExtractionResult {
  const known = new Set(form.fields.map((f) => f.field_key));
  const empty: ExtractionResult = { fields: {}, confidence: {} };
  if (!raw) return empty;
  // ```json 펜스나 앞뒤 잡텍스트가 있어도 첫 { … 마지막 } 를 잡는다
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object') return empty;
  const obj = parsed as { fields?: Record<string, unknown>; confidence?: Record<string, unknown> };
  const fields: Record<string, unknown> = {};
  const confidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj.fields ?? {})) {
    if (!known.has(k)) continue;                          // 폼에 없는 항목은 버린다
    if (v === null || v === undefined || v === '') continue;
    fields[k] = v;
  }
  for (const [k, v] of Object.entries(obj.confidence ?? {})) {
    if (!(k in fields)) continue;                         // 값이 채워진 항목의 신뢰도만
    const n = Number(v);
    if (Number.isFinite(n)) confidence[k] = Math.max(0, Math.min(1, n));
  }
  return { fields, confidence };
}

/** 응답 JSON 에서 텍스트를 꺼낸다 (Anthropic content 배열). */
function textFromResponse(body: unknown): string {
  const content = (body as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c?.type === 'text').map((c) => c.text ?? '').join('\n');
}

/** 설정으로 LLM 추출기를 만든다. 실제 API 호출은 여기서만. */
export function createLlmExtractor(cfg: LlmConfig): Extractor {
  return {
    name: `llm:${cfg.model}`,
    async extract(input: ExtractInput): Promise<ExtractionResult> {
      const req = buildAnthropicRequest(input.form, input, cfg);
      if (!req) return { fields: {}, confidence: {} }; // 읽을 수 없는 형식
      const doFetch = cfg.fetchImpl ?? fetch;
      const res = await doFetch(`${cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': cfg.anthropicVersion,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`LLM 추출 실패 (${res.status}): ${detail.slice(0, 300)}`);
      }
      const body = await res.json();
      return parseExtraction(textFromResponse(body), input.form);
    },
  };
}
