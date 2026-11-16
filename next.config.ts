import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. The browser only ever talks to this application's
 * own address (the Appwrite backend is reached by the server, not by pages),
 * so everything can be limited to 'self':
 *   - connect-src 'self'    page scripts cannot send data to any other site
 *   - frame-ancestors 'none' the site cannot be embedded (clickjacking)
 *   - form-action 'self'     forms cannot post to another site
 * Next.js needs inline scripts and styles for page start-up; the development
 * server additionally needs 'unsafe-eval' for hot reloading.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Older browsers: do not allow the site inside a frame.
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must not guess a different content type than the one declared.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never send this site's addresses (which can contain a reset token) to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  // The application uses none of these device features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS only, for two years.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework in responses.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
