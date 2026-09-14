import { ApiError, isRecord } from './http';
import type { AdminIdentity, Env } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RPC_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const SUPABASE_TIMEOUT_MS = 5_000;

function getBearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = match?.[1] || '';

  if (!token || token.length > 8_192 || !JWT_PATTERN.test(token)) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid Supabase bearer token is required.');
  }

  return token;
}

function getSupabaseOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if ((parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }

  return parsed.origin;
}

async function supabaseFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(502, 'AUTH_SERVICE_UNAVAILABLE', 'The authorization service is unavailable.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ApiError(502, 'AUTH_SERVICE_INVALID_RESPONSE', 'The authorization service returned an invalid response.');
  }
  return response;
}

async function parseSupabaseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError(502, 'AUTH_SERVICE_INVALID_RESPONSE', 'The authorization service returned an invalid response.');
  }
}

export async function requireSupabaseAdmin(request: Request, env: Env): Promise<AdminIdentity> {
  const token = getBearerToken(request);
  const supabaseOrigin = getSupabaseOrigin(env.SUPABASE_URL);
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const rpcName = String(env.SUPABASE_ADMIN_RPC || '').trim();

  if (!publishableKey || publishableKey.length > 4_096 || !RPC_NAME_PATTERN.test(rpcName)) {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }

  const authHeaders = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };

  const userResponse = await supabaseFetch(`${supabaseOrigin}/auth/v1/user`, {
    method: 'GET',
    headers: {
      ...authHeaders,
      Accept: 'application/json',
    },
  });

  if (!userResponse.ok) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'The Supabase session is invalid or expired.');
  }

  const userPayload = await parseSupabaseJson(userResponse);
  if (!isRecord(userPayload) || typeof userPayload.id !== 'string' || !UUID_PATTERN.test(userPayload.id)) {
    throw new ApiError(502, 'AUTH_SERVICE_INVALID_RESPONSE', 'The authorization service returned an invalid response.');
  }

  const adminResponse = await supabaseFetch(`${supabaseOrigin}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (adminResponse.status === 401 || adminResponse.status === 403) {
    throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  }
  if (!adminResponse.ok) {
    throw new ApiError(502, 'AUTH_SERVICE_UNAVAILABLE', 'Administrator authorization could not be completed.');
  }

  const adminPayload = await parseSupabaseJson(adminResponse);
  if (adminPayload !== true) {
    throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  }

  return {
    id: userPayload.id.toLowerCase(),
    email: typeof userPayload.email === 'string' ? userPayload.email : undefined,
  };
}
