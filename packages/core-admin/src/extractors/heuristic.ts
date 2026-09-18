/**
 * 기본(휴리스틱) 추출기 — 문서에 **실제로 적힌 텍스트만** 공식 폼 항목에 옮긴다.
 *
 * 왜 이게 있나: LLM 어댑터가 붙기 전에도 "서류가 올라오면 폼이 채워지는" 파이프라인이
 * 실제로 동작해야 한다. 다만 값을 **지어내지 않는다** — 문서에서 'label: value' 처럼
 * 찾은 문자열만 옮기고, 못 찾으면 비워 사람이 채우게 한다(설계 원칙과 동일).
 *
 * 대상: 텍스트로 읽히는 서류(내보낸 텍스트/CSV/JSON, 텍스트 PDF의 추출본 등).
 * 스캔 이미지·바이너리 PDF 는 글자를 못 읽으므로 아무것도 반환하지 않는다(현실과 동일).
 * 참조형 항목(person/org/file/table)은 자유 텍스트에서 안전히 해석할 수 없어 건너뛴다.
 *
 * 신뢰도: 항목 키로 정확히 맞으면 ~0.88, 라벨로 맞으면 ~0.72(검토 임계 0.8 아래라 사람이 꼭 본다).
 * 이 추출기는 어댑터일 뿐이다 — 운영에서 LLM 추출기를 registerExtractor 로 갈아끼우면 대체된다.
 */
import type { Extractor, ExtractInput, ExtractionResult } from '../ingest';
import type { FormField } from '../form-schema';
import { isFieldVisible } from '../form-schema';

/** 대소문자·성조·구두점을 지운 비교용 문자열 (베트남어 đ 포함). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 버퍼가 텍스트로 읽을 만한지 (바이너리면 글자를 못 읽는다고 본다). */
function looksTextual(data: Buffer, mime: string | null): boolean {
  if (mime && (mime.startsWith('text/') || mime === 'application/json' || mime.includes('csv'))) return true;
  const head = data.subarray(0, 1024);
  if (head.includes(0)) return false; // NUL 이 있으면 바이너리
  return true;
}

/** 문서를 정규화된 key→value 맵으로 만든다. JSON 이면 그대로, 아니면 'key: value' 줄 파싱. */
function parseDoc(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const add = (k: string, v: string) => {
    const nk = norm(k);
    const val = String(v).trim();
    if (nk && val && !map.has(nk)) map.set(nk, val);
  };

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) {
          if (v === null || typeof v === 'object') continue;
          add(k, String(v));
        }
        return map;
      }
    } catch {
      // JSON 이 아니면 줄 파싱으로 넘어간다
    }
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // 'label: value' / 'label = value' / 'label\tvalue' / 'label,value' 순으로 첫 구분자만 쓴다
    const m = line.match(/^(.+?)\s*[:=\t]\s*(.+)$/) ?? line.match(/^([^,]+),\s*(.+)$/);
    if (m) add(m[1], m[2]);
  }
  return map;
}

/** 값이 있는지 (빈 문자열·undefined 제외). */
function present(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/** 자유 텍스트 값을 항목 타입에 맞게 바꾼다. 불가능하면 undefined(옮기지 않음). */
function coerce(field: FormField, value: string): unknown {
  switch (field.data_type) {
    case 'text':
    case 'textarea':
      return value;
    case 'number': {
      const n = Number(value.replace(/[, ]/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      const m = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/); // DD/MM/YYYY
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return undefined;
    }
    case 'checkbox': {
      const t = norm(value);
      if (['true', 'yes', 'y', '1', 'co', 'x', 'on'].includes(t)) return true;
      if (['false', 'no', 'n', '0', 'khong', 'off'].includes(t)) return false;
      return undefined;
    }
    case 'select':
    case 'multiselect': {
      const opts = field.options ?? [];
      if (opts.length === 0) return undefined; // 선택지를 모르면 옮기지 않는다
      const pieces = field.data_type === 'multiselect' ? value.split(/[;,]/) : [value];
      const matched: string[] = [];
      for (const piece of pieces) {
        const np = norm(piece);
        const hit = opts.find(
          (o) => norm(o.value) === np || Object.values(o.label_i18n ?? {}).some((l) => norm(String(l)) === np)
        );
        if (hit) matched.push(hit.value);
      }
      if (matched.length === 0) return undefined;
      return field.data_type === 'multiselect' ? matched : matched[0];
    }
    default:
      return undefined; // person/org/file/table 등 참조형은 자유 텍스트에서 해석하지 않는다
  }
}

export const heuristicExtractor: Extractor = {
  name: 'heuristic-kv',
  async extract({ data, mimeType, form }: ExtractInput): Promise<ExtractionResult> {
    const fields: Record<string, unknown> = {};
    const confidence: Record<string, number> = {};
    if (!looksTextual(data, mimeType)) return { fields, confidence };

    const doc = parseDoc(data.toString('utf8'));
    if (doc.size === 0) return { fields, confidence };

    for (const f of form.fields) {
      if (!isFieldVisible(f, fields)) continue;
      // 후보 라벨: 항목 키(정확 매칭 우선) + 각 언어 라벨
      const keyCand = norm(f.field_key);
      const labelCands = Object.values(f.label_i18n ?? {}).map((l) => norm(String(l))).filter(Boolean);

      let raw: string | undefined;
      let conf = 0;
      if (doc.has(keyCand)) {
        raw = doc.get(keyCand);
        conf = 0.88;
      } else {
        for (const lc of labelCands) {
          if (doc.has(lc)) { raw = doc.get(lc); conf = 0.72; break; }
        }
      }
      if (raw === undefined) continue;

      const v = coerce(f, raw);
      if (!present(v) && typeof v !== 'boolean') continue; // 옮길 값이 없으면 건너뛴다
      fields[f.field_key] = v;
      confidence[f.field_key] = conf;
    }

    return { fields, confidence };
  },
};
