/**
 * GrowthOS — Shared CORS Configuration
 */

const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  // Production domains — update when domain is configured
  Deno.env.get('APP_ORIGIN') || '',
].filter(Boolean);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';

const APP_DOMAIN = Deno.env.get('APP_DOMAIN') || 'growthOS';

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
    origin.startsWith(SUPABASE_URL) ||
    (origin.endsWith('.vercel.app') && origin.includes(APP_DOMAIN)) ||
    origin === '';

  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-webhook-signature',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function getWebhookCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-webhook-signature, x-api-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export function handlePreflight(headers: Record<string, string>): Response {
  return new Response('ok', { status: 200, headers });
}

export function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
