import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 워크스페이스 패키지를 TS 소스 그대로 사용 (빌드 단계 분리 없이 개발 속도 확보)
  transpilePackages: ["@vsp/core-admin", "@vsp/sport-domain", "@vsp/web-shared"],
  // DB 드라이버는 번들링하지 않고 런타임에 그대로 로드한다
  // (pg는 네이티브 바인딩, PGlite는 WASM을 쓰기 때문)
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  experimental: {
    // 서버 액션에서 대용량 폼(첨부 포함) 처리
    serverActions: { bodySizeLimit: "10mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;
