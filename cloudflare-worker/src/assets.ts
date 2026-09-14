import { ApiError } from './http';
import type {
  AllowedImageExtension,
  AllowedImageMimeType,
  AssetType,
  Env,
  UploadDescriptor,
  UploadMetadata,
} from './types';

export const UUID_V4_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const UUID_V4_PATTERN = new RegExp(`^${UUID_V4_SOURCE}$`, 'i');
const SAFE_ASSET_KEY_PATTERN = new RegExp(
  `^stories/${UUID_V4_SOURCE}/(?:cover|pages)/${UUID_V4_SOURCE}\\.(?:avif|jpg|png|webp)$`,
);
const ABSOLUTE_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ABSOLUTE_MAX_DELETE_KEYS = 100;
const UPLOAD_QUERY_FIELDS = new Set(['assetType', 'storyPathId']);

const IMAGE_EXTENSIONS: Record<AllowedImageMimeType, AllowedImageExtension> = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function assertKnownFields(body: Record<string, unknown>, allowedFields: readonly string[]): void {
  const allowed = new Set(allowedFields);
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throw new ApiError(400, 'UNKNOWN_FIELD', 'The request contains an unsupported field.');
  }
}

function parseConfiguredInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(500, 'SERVER_MISCONFIGURED', 'The service is not configured correctly.');
  }
  return parsed;
}

function parseAssetType(value: unknown): AssetType {
  if (value !== 'cover' && value !== 'page') {
    throw new ApiError(400, 'INVALID_ASSET_TYPE', 'assetType must be cover or page.');
  }
  return value;
}

export function requireStoryPathId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
    throw new ApiError(400, 'INVALID_STORY_PATH_ID', 'storyPathId must be a version 4 UUID.');
  }
  return value.toLowerCase();
}

export function parseImageContentType(value: string | null): AllowedImageMimeType {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase() as AllowedImageMimeType | undefined;
  if (!normalized || !Object.prototype.hasOwnProperty.call(IMAGE_EXTENSIONS, normalized)) {
    throw new ApiError(415, 'UNSUPPORTED_IMAGE_TYPE', 'Only AVIF, JPEG, PNG, and WebP images are allowed.');
  }
  return normalized;
}

export function parseUploadMetadata(url: URL, request: Request): UploadMetadata {
  for (const field of url.searchParams.keys()) {
    if (!UPLOAD_QUERY_FIELDS.has(field)) {
      throw new ApiError(400, 'UNKNOWN_QUERY_PARAMETER', 'The request contains an unsupported query parameter.');
    }
  }

  const assetTypeValues = url.searchParams.getAll('assetType');
  const storyPathIdValues = url.searchParams.getAll('storyPathId');
  if (assetTypeValues.length !== 1 || storyPathIdValues.length !== 1) {
    throw new ApiError(400, 'INVALID_UPLOAD_QUERY', 'Provide exactly one assetType and one storyPathId query parameter.');
  }

  const contentEncoding = request.headers.get('Content-Encoding');
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
    throw new ApiError(415, 'UNSUPPORTED_CONTENT_ENCODING', 'Compressed request bodies are not supported.');
  }

  const assetType = parseAssetType(assetTypeValues[0]);
  const contentType = parseImageContentType(request.headers.get('Content-Type'));
  return {
    assetType,
    contentType,
    extension: IMAGE_EXTENSIONS[contentType],
    storyPathId: requireStoryPathId(storyPathIdValues[0]),
  };
}

export function getMaxImageBytes(env: Env): number {
  return parseConfiguredInteger(env.MAX_IMAGE_BYTES, 10 * 1024 * 1024, 1, ABSOLUTE_MAX_IMAGE_BYTES);
}

function parseDeclaredLength(request: Request, maxBytes: number): number | null {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength)) {
    throw new ApiError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid.');
  }

  const parsedLength = Number(declaredLength);
  if (!Number.isSafeInteger(parsedLength)) {
    throw new ApiError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid.');
  }
  if (parsedLength === 0) {
    throw new ApiError(400, 'EMPTY_IMAGE', 'The image body must not be empty.');
  }
  if (parsedLength > maxBytes) {
    throw new ApiError(413, 'IMAGE_TOO_LARGE', `The image body must not exceed ${maxBytes} bytes.`);
  }
  return parsedLength;
}

export async function readImageBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = parseDeclaredLength(request, maxBytes);
  if (!request.body) {
    throw new ApiError(400, 'EMPTY_IMAGE', 'The image body must not be empty.');
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
      throw new ApiError(413, 'IMAGE_TOO_LARGE', `The image body must not exceed ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  if (receivedBytes === 0) {
    throw new ApiError(400, 'EMPTY_IMAGE', 'The image body must not be empty.');
  }
  if (declaredLength !== null && receivedBytes !== declaredLength) {
    throw new ApiError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length does not match the image body.');
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function bytesEqual(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function asciiEquals(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset + expected.length > bytes.byteLength) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function isAvif(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16 || !asciiEquals(bytes, 4, 'ftyp')) return false;

  const boxSize = (
    (bytes[0]! * 0x1000000)
    + (bytes[1]! << 16)
    + (bytes[2]! << 8)
    + bytes[3]!
  );
  if (boxSize === 1 || (boxSize !== 0 && (boxSize < 16 || boxSize > bytes.byteLength))) return false;

  const boxEnd = boxSize === 0 ? bytes.byteLength : boxSize;
  if (asciiEquals(bytes, 8, 'avif') || asciiEquals(bytes, 8, 'avis')) return true;
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    if (asciiEquals(bytes, offset, 'avif') || asciiEquals(bytes, offset, 'avis')) return true;
  }
  return false;
}

export function assertImageMatchesContentType(bytes: Uint8Array, contentType: AllowedImageMimeType): void {
  const matches = contentType === 'image/avif'
    ? isAvif(bytes)
    : contentType === 'image/jpeg'
      ? bytes.byteLength >= 3 && bytesEqual(bytes, 0, [0xff, 0xd8, 0xff])
      : contentType === 'image/png'
        ? bytes.byteLength >= 8 && bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : bytes.byteLength >= 12 && asciiEquals(bytes, 0, 'RIFF') && asciiEquals(bytes, 8, 'WEBP');

  if (!matches) {
    throw new ApiError(400, 'IMAGE_TYPE_MISMATCH', 'The image bytes do not match the declared Content-Type.');
  }
}

export function createUploadDescriptor(metadata: UploadMetadata, size: number): UploadDescriptor {
  const directory = metadata.assetType === 'cover' ? 'cover' : 'pages';
  return {
    ...metadata,
    key: `stories/${metadata.storyPathId}/${directory}/${crypto.randomUUID()}.${metadata.extension}`,
    size,
  };
}

export function parseDeleteKeys(body: Record<string, unknown>, env: Env): string[] {
  assertKnownFields(body, ['key', 'keys']);
  const hasKey = Object.prototype.hasOwnProperty.call(body, 'key');
  const hasKeys = Object.prototype.hasOwnProperty.call(body, 'keys');
  if (hasKey === hasKeys) {
    throw new ApiError(400, 'INVALID_DELETE_REQUEST', 'Provide exactly one of key or keys.');
  }

  const requestedKeys = hasKey ? [body.key] : body.keys;
  if (!Array.isArray(requestedKeys)) {
    throw new ApiError(400, 'INVALID_DELETE_REQUEST', 'keys must be an array.');
  }

  const maxKeys = parseConfiguredInteger(env.MAX_DELETE_KEYS, 25, 1, ABSOLUTE_MAX_DELETE_KEYS);
  if (requestedKeys.length === 0 || requestedKeys.length > maxKeys) {
    throw new ApiError(400, 'INVALID_DELETE_COUNT', `Between 1 and ${maxKeys} asset keys may be deleted at once.`);
  }

  const uniqueKeys = new Set<string>();
  for (const key of requestedKeys) {
    if (typeof key !== 'string' || key.length > 256 || !SAFE_ASSET_KEY_PATTERN.test(key)) {
      throw new ApiError(400, 'UNSAFE_ASSET_KEY', 'One or more asset keys are not managed Tellora story image keys.');
    }
    uniqueKeys.add(key);
  }

  return [...uniqueKeys];
}
