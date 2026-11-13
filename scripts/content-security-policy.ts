/*
 * The policy the production page declares. The app is static files: it loads
 * its own scripts, styles, fonts, images, and workers, and connects nowhere else.
 * Inline scripts, inline style elements, plugins, and a changed base address
 * are all refused, so text that reaches the page cannot run as code.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
