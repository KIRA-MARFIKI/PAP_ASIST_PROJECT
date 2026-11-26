/**
 * Shared configurable CORS helper for all PaP Asist Supabase Edge Functions.
 *
 * Local development origins (localhost/127.0.0.1 ports 5173 & 5174) are always allowed.
 * Set `ALLOWED_ORIGINS` in Supabase Secrets (comma-separated, e.g.
 * `https://pap-asist.pages.dev,http://localhost:5173,http://localhost:5174`)
 * to lock CORS strictly to your production domain(s).
 */

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const requestOrigin = (req.headers.get('Origin') || '').trim();
  const rawAllowed = (Deno.env.get('ALLOWED_ORIGINS') || '').trim();

  const configuredOrigins = rawAllowed
    ? rawAllowed
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

  let allowOrigin = '*';

  if (configuredOrigins.length > 0) {
    const allowedSet = new Set([...LOCAL_DEV_ORIGINS, ...configuredOrigins]);
    if (requestOrigin && allowedSet.has(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else {
      allowOrigin = configuredOrigins[0];
    }
  } else if (requestOrigin) {
    // Dev stage fallback when ALLOWED_ORIGINS is not yet set in Supabase Secrets.
    allowOrigin = requestOrigin;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
