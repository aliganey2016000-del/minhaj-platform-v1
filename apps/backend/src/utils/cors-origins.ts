/**
 * Allowed CORS origins — CLIENT_URL accepts a comma-separated list so the
 * platform can serve more than one frontend origin (e.g. the main
 * sahaledu.com deployment plus a fully separate custom domain some
 * organizations use), not just a single hardcoded URL.
 */

export function getAllowedOrigins(): string[] {
  const raw = process.env.CLIENT_URL || 'http://localhost:5173';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
