import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const buildDirectory = await mkdtemp(join(tmpdir(), 'tellora-worker-tests-'));
const bundlePath = join(buildDirectory, 'worker.mjs');
await build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  format: 'esm',
  outfile: bundlePath,
  platform: 'node',
  target: 'node22',
});
const { default: worker } = await import(pathToFileURL(bundlePath).href);

after(async () => {
  await rm(buildDirectory, { force: true, recursive: true });
});

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const STORY_ID = '22222222-2222-4222-8222-222222222222';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'http://localhost:5173';
const TOKEN = 'a.b.c';

function createEnvironment(bucketOverrides = {}) {
  const bucket = {
    async delete() {},
    async list() {
      return { objects: [], truncated: false };
    },
    async put() {
      return { etag: 'test-etag' };
    },
    ...bucketOverrides,
  };

  return {
    bucket,
    env: {
      ALLOWED_ORIGINS: ORIGIN,
      MAX_DELETE_KEYS: '25',
      MAX_IMAGE_BYTES: '10485760',
      STORY_ASSETS: bucket,
      SUPABASE_ADMIN_RPC: 'is_admin',
      SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
      SUPABASE_URL: 'https://example.supabase.co',
    },
  };
}

async function withSupabaseSession(callback, { admin = true } = {}) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.equal(init?.redirect, 'manual');
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) {
      return Response.json({ email: 'admin@example.test', id: ADMIN_ID });
    }
    if (url.includes('/rest/v1/rpc/is_admin')) {
      return Response.json(admin);
    }
    throw new Error(`Unexpected Supabase URL in test: ${url}`);
  };

  try {
    return await callback(() => calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function authorizedHeaders(contentType) {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': contentType,
    Origin: ORIGIN,
  };
}

test('health is public and does not proxy R2', async () => {
  const { env } = createEnvironment();
  const response = await worker.fetch(new Request('https://worker.test/health'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'kids-story-assets-api' });
});

test('CORS preflight permits authenticated PUT uploads', async () => {
  const { env } = createEnvironment();
  const response = await worker.fetch(new Request('https://worker.test/assets', {
    method: 'OPTIONS',
    headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Headers': 'authorization, content-type',
      'Access-Control-Request-Method': 'PUT',
    },
  }), env);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(response.headers.get('Access-Control-Allow-Methods') || '', /PUT/);
});

test('upload rejects an unauthenticated caller before writing R2', async () => {
  let writes = 0;
  const { env } = createEnvironment({
    async put() {
      writes += 1;
      return { etag: 'unexpected' };
    },
  });
  const response = await worker.fetch(new Request(
    `https://worker.test/assets?assetType=cover&storyPathId=${STORY_ID}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', Origin: ORIGIN },
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
  ), env);

  assert.equal(response.status, 401);
  assert.equal(writes, 0);
});

test('upload rejects an invalid Supabase session before writing R2', async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.redirect, 'manual');
    return Response.json({ message: 'invalid session' }, { status: 403 });
  };
  const { env } = createEnvironment({
    async put() {
      writes += 1;
      return { etag: 'unexpected' };
    },
  });

  try {
    const response = await worker.fetch(new Request(
      `https://worker.test/assets?assetType=cover&storyPathId=${STORY_ID}`,
      {
        method: 'PUT',
        headers: authorizedHeaders('image/png'),
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    ), env);
    assert.equal(response.status, 401);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authenticated upload validates bytes and stores immutable metadata', async () => {
  const writes = [];
  const { env } = createEnvironment({
    async put(key, bytes, options) {
      writes.push({ key, bytes, options });
      return { etag: 'stored-etag' };
    },
  });

  await withSupabaseSession(async (getCallCount) => {
    const response = await worker.fetch(new Request(
      `https://worker.test/assets?assetType=cover&storyPathId=${STORY_ID}`,
      {
        method: 'PUT',
        headers: authorizedHeaders('image/png'),
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    ), env);

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const payload = await response.json();
    assert.match(payload.asset.key, new RegExp(`^stories/${STORY_ID}/cover/[0-9a-f-]{36}\\.png$`));
    assert.equal(payload.asset.size, 8);
    assert.equal(payload.asset.etag, 'stored-etag');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].options.httpMetadata.contentType, 'image/png');
    assert.equal(writes[0].options.httpMetadata.cacheControl, 'public, max-age=31536000, immutable');
    assert.equal(getCallCount(), 2);
  });
});

test('POST upload rejects bytes that do not match the MIME type', async () => {
  let writes = 0;
  const { env } = createEnvironment({
    async put() {
      writes += 1;
      return { etag: 'unexpected' };
    },
  });

  await withSupabaseSession(async () => {
    const response = await worker.fetch(new Request(
      `https://worker.test/assets?assetType=page&storyPathId=${STORY_ID}`,
      {
        method: 'POST',
        headers: authorizedHeaders('image/webp'),
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    ), env);

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'IMAGE_TYPE_MISMATCH');
    assert.equal(writes, 0);
  });
});

test('authenticated non-admin cannot upload', async () => {
  let writes = 0;
  const { env } = createEnvironment({
    async put() {
      writes += 1;
      return { etag: 'unexpected' };
    },
  });

  await withSupabaseSession(async () => {
    const response = await worker.fetch(new Request(
      `https://worker.test/assets?assetType=cover&storyPathId=${STORY_ID}`,
      {
        method: 'PUT',
        headers: authorizedHeaders('image/png'),
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    ), env);
    assert.equal(response.status, 403);
    assert.equal(writes, 0);
  }, { admin: false });
});

test('DELETE rejects an unauthenticated caller before deleting R2', async () => {
  let deletes = 0;
  const { env } = createEnvironment({
    async delete() {
      deletes += 1;
    },
  });
  const key = `stories/${STORY_ID}/pages/${ASSET_ID}.webp`;
  const response = await worker.fetch(new Request('https://worker.test/assets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ key }),
  }), env);

  assert.equal(response.status, 401);
  assert.equal(deletes, 0);
});

test('DELETE rejects an authenticated non-admin before deleting R2', async () => {
  let deletes = 0;
  const { env } = createEnvironment({
    async delete() {
      deletes += 1;
    },
  });
  const key = `stories/${STORY_ID}/pages/${ASSET_ID}.webp`;

  await withSupabaseSession(async () => {
    const response = await worker.fetch(new Request('https://worker.test/assets', {
      method: 'DELETE',
      headers: authorizedHeaders('application/json'),
      body: JSON.stringify({ key }),
    }), env);
    assert.equal(response.status, 403);
    assert.equal(deletes, 0);
  }, { admin: false });
});

test('DELETE rejects traversal keys before calling R2', async () => {
  let deletes = 0;
  const { env } = createEnvironment({
    async delete() {
      deletes += 1;
    },
  });

  await withSupabaseSession(async () => {
    const response = await worker.fetch(new Request('https://worker.test/assets', {
      method: 'DELETE',
      headers: authorizedHeaders('application/json'),
      body: JSON.stringify({ key: `stories/${STORY_ID}/../../secret.webp` }),
    }), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'UNSAFE_ASSET_KEY');
    assert.equal(deletes, 0);
  });
});

test('DELETE accepts a generated image key', async () => {
  const deleted = [];
  const key = `stories/${STORY_ID}/pages/${ASSET_ID}.webp`;
  const { env } = createEnvironment({
    async delete(value) {
      deleted.push(value);
    },
  });

  await withSupabaseSession(async () => {
    const response = await worker.fetch(new Request('https://worker.test/assets', {
      method: 'DELETE',
      headers: authorizedHeaders('application/json'),
      body: JSON.stringify({ key }),
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(deleted, [key]);
  });
});

test('story cleanup deletes every object under the exact story prefix', async () => {
  const firstKey = `stories/${STORY_ID}/cover/${ASSET_ID}.webp`;
  const secondKey = `stories/${STORY_ID}/pages/44444444-4444-4444-8444-444444444444.png`;
  const deleted = [];
  let listings = 0;
  const { env } = createEnvironment({
    async delete(value) {
      deleted.push(value);
    },
    async list(options) {
      listings += 1;
      assert.equal(options.prefix, `stories/${STORY_ID}/`);
      return listings === 1
        ? { objects: [{ key: firstKey }, { key: secondKey }], truncated: false }
        : { objects: [], truncated: false };
    },
  });

  await withSupabaseSession(async () => {
    const response = await worker.fetch(new Request(
      `https://worker.test/stories/${STORY_ID}/assets`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}`, Origin: ORIGIN } },
    ), env);
    assert.equal(response.status, 200);
    assert.deepEqual(deleted, [[firstKey, secondKey]]);
    assert.equal((await response.json()).deleted, 2);
  });
});
