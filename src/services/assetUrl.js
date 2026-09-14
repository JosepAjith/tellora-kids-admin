function normalizePublicBaseUrl(value) {
  const configuredUrl = String(value || '').trim();
  if (!configuredUrl) {
    throw new Error('R2 public reads are not configured. Set VITE_R2_PUBLIC_BASE_URL and restart the app.');
  }

  let parsed;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error('VITE_R2_PUBLIC_BASE_URL must be a complete http(s) URL.');
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const isOriginOnly = parsed.pathname === '/' && !parsed.search && !parsed.hash
    && !parsed.username && !parsed.password;
  if ((parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) || !isOriginOnly) {
    throw new Error('VITE_R2_PUBLIC_BASE_URL must be a secure origin without credentials, a path, query parameters, or a fragment.');
  }

  return parsed.origin;
}

function normalizeObjectKey(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 1024) {
    throw new Error('The R2 object key is invalid.');
  }

  const key = value.replace(/^\/+/, '');
  const segments = key.split('/');
  if (!key || key.includes('\\') || key.includes('?') || key.includes('#')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('The R2 object key is invalid.');
  }

  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

export function buildAssetUrl(publicBaseUrl, key) {
  if (!key) return '';
  return `${normalizePublicBaseUrl(publicBaseUrl)}/${normalizeObjectKey(key)}`;
}

export function getAssetUrl(key) {
  if (!key) return '';
  return buildAssetUrl(import.meta.env.VITE_R2_PUBLIC_BASE_URL, key);
}
