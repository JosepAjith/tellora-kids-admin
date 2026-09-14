import { extractWorkerErrorMessage } from './workerErrors.js';
import { requireSupabase } from './supabase.js';
import { getAssetUrl } from './assetUrl.js';

export { getAssetUrl } from './assetUrl.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getWorkerUrl() {
  const configuredUrl = import.meta.env.VITE_R2_WORKER_URL?.trim();
  if (!configuredUrl) {
    throw new Error('R2 uploads are not configured. Set VITE_R2_WORKER_URL and restart the app.');
  }

  let parsed;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error('VITE_R2_WORKER_URL must be a complete http(s) URL, including https://.');
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if ((parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_R2_WORKER_URL must be a secure Worker URL without credentials, query parameters, or a fragment.');
  }

  return parsed.href.replace(/\/$/, '');
}

async function getAccessToken() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Your session expired. Sign in again before managing assets.');
  return data.session.access_token;
}

async function workerRequest(path, options) {
  const accessToken = await getAccessToken();

  const url = `${getWorkerUrl()}${path}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  } catch (networkError) {
    throw new Error(
      `The media worker is unreachable at ${url}. Check VITE_R2_WORKER_URL and the worker deployment.`,
      { cause: networkError }
    );
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const workerError = extractWorkerErrorMessage(
      result,
      `The asset service returned HTTP ${response.status}.`
    );
    throw new Error(workerError);
  }
  return result;
}

function uploadToWorker(file, { assetType, storyPathId, accessToken, onProgress }) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({ assetType, storyPathId });
    const url = `${getWorkerUrl()}/assets?${query}`;
    const request = new XMLHttpRequest();
    request.open('POST', url, true);
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    request.setRequestHeader('Content-Type', file.type);
    request.setRequestHeader('Accept', 'application/json');
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      const result = (() => {
        try {
          return request.responseText ? JSON.parse(request.responseText) : {};
        } catch {
          return {};
        }
      })();

      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(result);
      } else {
        reject(new Error(extractWorkerErrorMessage(
          result,
          `The asset service returned HTTP ${request.status}.`
        )));
      }
    });
    request.addEventListener('error', () => reject(new Error(`The media worker is unreachable at ${getWorkerUrl()}.`)));
    request.addEventListener('abort', () => reject(new Error('The image upload was canceled.')));
    request.send(file);
  });
}

export async function uploadImageFile(
  file,
  { assetType, storyPathId, onProgress = () => {} }
) {
  if (!(file instanceof File)) throw new Error('Select an image file to upload.');
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only AVIF, JPEG, PNG, and WebP images are supported.');
  }
  if (!file.size || file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be larger than 0 bytes and no more than 10 MB.');
  }
  if (!['cover', 'page'].includes(assetType)) throw new Error('Invalid story asset type.');
  if (typeof storyPathId !== 'string' || !UUID_V4_PATTERN.test(storyPathId)) {
    throw new Error('A valid story ID is required before uploading an image.');
  }

  const accessToken = await getAccessToken();
  const result = await uploadToWorker(file, {
    assetType,
    storyPathId,
    accessToken,
    onProgress,
  });

  const key = result?.asset?.key;
  if (typeof key !== 'string' || !key) {
    throw new Error('The asset service returned an invalid upload response.');
  }

  return {
    key,
    url: getAssetUrl(key),
    storyPathId: result.asset.storyPathId,
  };
}

export async function deleteAssets(keys) {
  const uniqueKeys = [...new Set((keys || []).filter(Boolean))];
  if (!uniqueKeys.length) return { deleted: 0, keys: [] };

  const deletedKeys = [];
  for (let index = 0; index < uniqueKeys.length; index += 25) {
    const chunk = uniqueKeys.slice(index, index + 25);
    const result = await workerRequest('/assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: chunk }),
    });
    deletedKeys.push(...(result.keys || chunk));
  }

  return { deleted: deletedKeys.length, keys: deletedKeys };
}

export async function deleteAsset(key) {
  return deleteAssets([key]);
}

export async function deleteStoryAssets(storyId) {
  if (typeof storyId !== 'string' || !UUID_V4_PATTERN.test(storyId)) {
    throw new Error('A valid story ID is required to clean up its assets.');
  }

  return workerRequest(`/stories/${encodeURIComponent(storyId)}/assets`, {
    method: 'DELETE',
  });
}
