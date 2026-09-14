import { ApiError } from './http';
import type { Env, UploadDescriptor } from './types';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PREFIX_DELETE_PAGE_SIZE = 1_000;

function getBucket(env: Env): R2Bucket {
  if (!env.STORY_ASSETS || typeof env.STORY_ASSETS.put !== 'function') {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }
  return env.STORY_ASSETS;
}

export async function storeImage(
  descriptor: UploadDescriptor,
  bytes: Uint8Array,
  env: Env,
): Promise<{ etag: string }> {
  try {
    const stored = await getBucket(env).put(descriptor.key, bytes, {
      httpMetadata: {
        cacheControl: CACHE_CONTROL,
        contentType: descriptor.contentType,
      },
    });
    if (!stored) {
      throw new Error('R2 put returned no object metadata.');
    }
    return { etag: stored.etag };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'STORAGE_WRITE_FAILED', 'The image could not be stored.');
  }
}

export async function deleteAssetKeys(keys: string[], env: Env): Promise<void> {
  try {
    await getBucket(env).delete(keys.length === 1 ? keys[0]! : keys);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'STORAGE_DELETE_FAILED', 'The requested assets could not be deleted.');
  }
}

export async function deleteStoryAssetPrefix(storyPathId: string, env: Env): Promise<number> {
  const bucket = getBucket(env);
  const prefix = `stories/${storyPathId}/`;
  let deleted = 0;

  try {
    while (true) {
      const page = await bucket.list({ limit: PREFIX_DELETE_PAGE_SIZE, prefix });
      const keys = page.objects.map((object) => object.key);
      if (keys.some((key) => !key.startsWith(prefix))) {
        throw new ApiError(502, 'STORAGE_INVALID_RESPONSE', 'The asset store returned an invalid listing.');
      }
      if (keys.length === 0) break;

      await bucket.delete(keys.length === 1 ? keys[0]! : keys);
      deleted += keys.length;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'STORAGE_DELETE_FAILED', 'The story assets could not be deleted.');
  }

  return deleted;
}
