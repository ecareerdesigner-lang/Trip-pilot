import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  experimental: {
    // Keep server-only packages out of the client bundle.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            // Limits where the page may load code and send data.
            //
            // 'unsafe-inline' and 'unsafe-eval' on scripts are needed by
            // Next's dev overlay and by MapLibre, which compiles its style
            // expressions at runtime. Tightening these means nonce-based
            // script tags, which is a real change rather than a config line.
            //
            // connect-src is the one that matters most here: it is what stops
            // a compromised dependency from posting a session cookie or trip
            // data to an arbitrary host.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https://tile.openstreetmap.org",
              "connect-src 'self' https://api.anthropic.com https://tile.openstreetmap.org",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
