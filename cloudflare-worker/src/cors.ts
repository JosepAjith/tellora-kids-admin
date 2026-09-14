import { ApiError } from './http';

const ALLOWED_REQUEST_HEADERS = new Set(['authorization', 'content-type']);

function normalizeConfiguredOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const isAllowedProtocol = parsed.protocol === 'https:' || (isLocal && parsed.protocol === 'http:');
  const hasOnlyOrigin = parsed.username === '' && parsed.password === '' && parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
  if (!isAllowedProtocol || !hasOnlyOrigin || parsed.origin === 'null') {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }

  return parsed.origin;
}

export function parseAllowedOrigins(value: string): Set<string> {
  const configuredOrigins = String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeConfiguredOrigin);

  if (configuredOrigins.length === 0 || configuredOrigins.includes('*')) {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }

  return new Set(configuredOrigins);
}

export function assertRequestOrigin(request: Request, allowedOrigins: Set<string>): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  if (!allowedOrigins.has(origin)) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.');
  }

  return origin;
}

export function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflightResponse(request: Request, origin: string, allowedMethods: readonly string[]): Response {
  const requestedMethod = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
  if (!requestedMethod || !allowedMethods.includes(requestedMethod)) {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'The requested CORS method is not allowed.');
  }

  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

  if (requestedHeaders.some((header) => !ALLOWED_REQUEST_HEADERS.has(header))) {
    throw new ApiError(403, 'HEADERS_NOT_ALLOWED', 'One or more requested CORS headers are not allowed.');
  }

  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': allowedMethods.join(', '),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  });
  return new Response(null, { status: 204, headers });
}
