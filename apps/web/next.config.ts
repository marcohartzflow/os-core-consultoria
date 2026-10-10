import path from "node:path";
import type { NextConfig } from "next";

// Demo fork: without API_URL the portal answers /api/* from its own mock (src/app/api, src/mock),
// so it runs with no backend and no database. Set API_URL to point at the real Spring API.
const apiUrl = process.env.API_URL;

const nextConfig: NextConfig = {
  // Imagem Docker mínima (apps/web/Dockerfile). A raiz do monorepo entra no trace para o pnpm workspace.
  output: "standalone",
  poweredByHeader: false,
  // Demo recorded on video: no Next.js badge in the corner.
  devIndicators: false,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Uma origem só: o browser fala com /api/* no Next, o Next repassa ao Spring.
  // Sem CORS, cookie de sessão fica first-party, SSE do chat funciona com EventSource.
  rewrites() {
    if (!apiUrl) return { beforeFiles: [] };
    return {
      beforeFiles: [
        // The API's health (status only, no details) under the public origin, for the CD's check
        // after each deploy and the external uptime monitor: it exercises Caddy, the Next server,
        // the API and its database in one request.
        { source: "/api/health", destination: `${apiUrl}/actuator/health` },
        { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      ],
    };
  },
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Isolamento entre origens (OWASP HTTP Headers Cheat Sheet): nenhuma janela de outra origem
          // fica com referência a esta, e nenhum site de fora embute os recursos daqui.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        ],
      },
    ];
  },
};

export default nextConfig;
