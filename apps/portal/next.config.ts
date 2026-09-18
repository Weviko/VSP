import type { NextConfig } from "next";

/**
 * 대외 웹사이트.
 *
 * 이 앱은 로그인·서버 액션·파일 업로드가 없다. 쓰기 경로가 아예 없는 것이 이 앱의 보안 설계다.
 * 데이터는 @vsp/public-data 만 통해 읽고, 운영에서는 읽기 전용 DB 역할(vsp_portal)로 접속한다.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@vsp/public-data", "@vsp/web-shared", "@vsp/core-admin", "@vsp/sport-domain"],
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // 공개 페이지는 검색 유입(= 광고 트래픽)과 직결되므로 서버 렌더링을 유지한다
  poweredByHeader: false,
};

export default nextConfig;
