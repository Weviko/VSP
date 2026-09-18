/**
 * Zalo ZNS 알림 어댑터 — 베트남 표준 채널(문서: 운영 방식).
 *
 * 베트남에서 이메일 도달률이 낮아 Zalo ZNS(Notification Service)가 사실상 표준이다.
 * ZNS 는 자유 문자가 아니라 **사전 승인된 템플릿(template_id) + 파라미터** 로만 보낸다.
 * 그래서 알림 코드(APPROVAL_PENDING 등)를 OA 에 등록한 ZNS 템플릿 id 에 매핑한다.
 *
 * LLM 추출기와 같은 방식: 키·엔드포인트·템플릿맵을 환경변수로 주입하고, 키가 없으면 등록되지 않아
 * 콘솔 어댑터로 폴백한다. 실제 호출은 여기서만 하고, 테스트는 fetchImpl 주입으로 네트워크 없이 한다.
 */
import type { NotifyAdapter } from '../notify';

export interface ZaloConfig {
  accessToken: string;
  endpoint: string;                       // 기본 https://business.openapi.zalo.me/message/template
  templateMap: Record<string, string>;    // 알림 코드 → ZNS template_id
  defaultTemplateId?: string;             // 매핑에 없을 때 쓸 기본 템플릿
  fetchImpl?: typeof fetch;
}

/** 환경변수에서 설정을 읽는다. 토큰이 없으면 null (→ 등록 안 함 → 콘솔 폴백). */
export function zaloConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ZaloConfig | null {
  const accessToken = env.ZALO_OA_TOKEN;
  if (!accessToken) return null;
  let templateMap: Record<string, string> = {};
  if (env.ZALO_ZNS_TEMPLATES) {
    try { templateMap = JSON.parse(env.ZALO_ZNS_TEMPLATES); } catch { templateMap = {}; }
  }
  return {
    accessToken,
    endpoint: env.ZALO_ZNS_ENDPOINT ?? 'https://business.openapi.zalo.me/message/template',
    templateMap,
    defaultTemplateId: env.ZALO_ZNS_DEFAULT_TEMPLATE,
  };
}

/** ZNS 요청 본문을 만든다 (순수 함수). 전화번호는 베트남 국내형(0xxx…)을 84xxx… 로 정규화. */
export function buildZnsRequest(
  cfg: Pick<ZaloConfig, 'templateMap' | 'defaultTemplateId'>,
  to: string,
  body: string,
  payload?: { templateCode?: string; vars?: Record<string, string | number> }
): { phone: string; template_id: string; template_data: Record<string, string> } | null {
  const code = payload?.templateCode;
  const templateId = (code && cfg.templateMap[code]) || cfg.defaultTemplateId;
  if (!templateId) return null; // 매핑된 ZNS 템플릿이 없으면 보낼 수 없다
  const phone = to.replace(/[^\d+]/g, '').replace(/^\+?84/, '84').replace(/^0/, '84');
  const vars = payload?.vars ?? {};
  const template_data: Record<string, string> = { content: body };
  for (const [k, v] of Object.entries(vars)) template_data[k] = String(v);
  return { phone, template_id: templateId, template_data };
}

/** 설정으로 Zalo ZNS 어댑터를 만든다. 실제 API 호출은 여기서만. */
export function createZaloAdapter(cfg: ZaloConfig): NotifyAdapter {
  return {
    channel: 'ZALO',
    async send(to, body, payload) {
      const req = buildZnsRequest(cfg, to, body, payload as { templateCode?: string; vars?: Record<string, string | number> } | undefined);
      if (!req) throw new Error('NO_ZALO_TEMPLATE'); // 매핑 필요 — FAILED 로 남아 운영자가 본다
      const doFetch = cfg.fetchImpl ?? fetch;
      const res = await doFetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: cfg.accessToken },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`ZNS HTTP ${res.status}`);
      const data = (await res.json()) as { error?: number; message?: string };
      // ZNS 는 성공도 200 으로 주고 본문 error 필드로 결과를 알린다(0 = 성공).
      if (data && typeof data.error === 'number' && data.error !== 0) {
        throw new Error(`ZNS error ${data.error}: ${data.message ?? ''}`);
      }
    },
  };
}
