import {
  assertImageMatchesContentType,
  createUploadDescriptor,
  getMaxImageBytes,
  parseDeleteKeys,
  parseUploadMetadata,
  requireStoryPathId,
  UUID_V4_SOURCE,
  readImageBody,
} from './assets';
import { requireSupabaseAdmin } from './auth';
import { assertRequestOrigin, parseAllowedOrigins, preflightResponse, withCors } from './cors';
import { ApiError, errorResponse, jsonResponse, readJsonObject } from './http';
import { deleteAssetKeys, deleteStoryAssetPrefix, storeImage } from './r2';
import type { Env } from './types';

type Route =
  | { kind: 'assets'; allowedMethods: readonly ['POST', 'PUT', 'DELETE'] }
  | { kind: 'health'; allowedMethods: readonly ['GET'] }
  | { kind: 'story-assets'; allowedMethods: readonly ['DELETE']; storyPathId: string };

const ASSET_METHODS = ['POST', 'PUT', 'DELETE'] as const;
const HEALTH_METHODS = ['GET'] as const;
const DELETE_METHOD = ['DELETE'] as const;
const STORY_ASSETS_ROUTE = new RegExp(`^/stories/(${UUID_V4_SOURCE})/assets$`, 'i');

function resolveRoute(pathname: string): Route | null {
  if (pathname === '/health') return { kind: 'health', allowedMethods: HEALTH_METHODS };
  if (pathname === '/assets') return { kind: 'assets', allowedMethods: ASSET_METHODS };

  const storyMatch = STORY_ASSETS_ROUTE.exec(pathname);
  if (storyMatch) {
    return {
      kind: 'story-assets',
      allowedMethods: DELETE_METHOD,
      storyPathId: requireStoryPathId(storyMatch[1]),
    };
  }
  return null;
}

async function handleUpload(request: Request, env: Env, url: URL): Promise<Response> {
  await requireSupabaseAdmin(request, env);
  const metadata = parseUploadMetadata(url, request);
  const bytes = await readImageBody(request, getMaxImageBytes(env));
  assertImageMatchesContentType(bytes, metadata.contentType);

  const descriptor = createUploadDescriptor(metadata, bytes.byteLength);
  const stored = await storeImage(descriptor, bytes, env);
  return jsonResponse(
    {
      asset: {
        assetType: descriptor.assetType,
        contentType: descriptor.contentType,
        etag: stored.etag,
        key: descriptor.key,
        size: descriptor.size,
        storyPathId: descriptor.storyPathId,
      },
    },
    201,
  );
}

async function handleDelete(request: Request, env: Env): Promise<Response> {
  await requireSupabaseAdmin(request, env);
  const body = await readJsonObject(request);
  const keys = parseDeleteKeys(body, env);

  await deleteAssetKeys(keys, env);
  return jsonResponse({
    deleted: keys.length,
    keys,
  });
}

async function handleStoryCleanup(request: Request, storyPathId: string, env: Env): Promise<Response> {
  await requireSupabaseAdmin(request, env);
  const deleted = await deleteStoryAssetPrefix(storyPathId, env);
  return jsonResponse({
    deleted,
    prefix: `stories/${storyPathId}/`,
    storyPathId,
  });
}

async function routeRequest(request: Request, env: Env, url: URL, route: Route): Promise<Response> {
  if (!route.allowedMethods.some((method) => method === request.method)) {
    return jsonResponse(
      {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'The request method is not allowed for this endpoint.',
        },
      },
      405,
      { Allow: route.allowedMethods.join(', ') },
    );
  }

  if (route.kind === 'health') {
    return jsonResponse({ ok: true, service: 'kids-story-assets-api' });
  }
  if (route.kind === 'story-assets') {
    return handleStoryCleanup(request, route.storyPathId, env);
  }
  if (request.method === 'DELETE') {
    return handleDelete(request, env);
  }
  return handleUpload(request, env, url);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const pathname = url.pathname;
    let corsOrigin: string | null = null;
    let response: Response;

    try {
      const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
      corsOrigin = assertRequestOrigin(request, allowedOrigins);

      const route = resolveRoute(pathname);
      if (!route) {
        throw new ApiError(404, 'NOT_FOUND', 'The requested endpoint does not exist.');
      }

      if (request.method === 'OPTIONS') {
        if (!corsOrigin) {
          throw new ApiError(400, 'MISSING_ORIGIN', 'A valid Origin header is required for CORS preflight.');
        }
        response = preflightResponse(request, corsOrigin, route.allowedMethods);
      } else {
        response = await routeRequest(request, env, url, route);
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status >= 500) {
        console.error('request_failed', {
          code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
          method: request.method,
          path: pathname,
          requestId,
        });
      }
      response = errorResponse(error);
    }

    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    return withCors(response, corsOrigin);
  },
} satisfies ExportedHandler<Env>;
