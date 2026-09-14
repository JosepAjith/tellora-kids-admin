const DEFAULT_JSON_BODY_LIMIT = 16 * 1024;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');

  return new Response(JSON.stringify(payload), { status, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      error.status,
    );
  }

  return jsonResponse(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
      },
    },
    500,
  );
}

export async function readJsonObject(request: Request, maxBytes = DEFAULT_JSON_BODY_LIMIT): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }

  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new ApiError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid.');
    }
    if (parsedLength > maxBytes) {
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The JSON request body is too large.');
    }
  }

  if (!request.body) {
    throw new ApiError(400, 'INVALID_JSON', 'A JSON request body is required.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'The JSON request body is too large.');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new ApiError(400, 'INVALID_JSON_OBJECT', 'The JSON request body must be an object.');
  }

  return parsed;
}
