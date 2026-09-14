import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetUrl } from './assetUrl.js';

test('buildAssetUrl joins a configured public origin and object key', () => {
  assert.equal(
    buildAssetUrl('https://assets.example.test/', 'stories/123/cover.webp'),
    'https://assets.example.test/stories/123/cover.webp'
  );
});

test('buildAssetUrl safely encodes path segments', () => {
  assert.equal(
    buildAssetUrl('https://assets.example.test', '/stories/story id/cover image.webp'),
    'https://assets.example.test/stories/story%20id/cover%20image.webp'
  );
});

test('buildAssetUrl rejects traversal and insecure remote origins', () => {
  assert.throws(
    () => buildAssetUrl('https://assets.example.test', 'stories/../private.webp'),
    /object key is invalid/
  );
  assert.throws(
    () => buildAssetUrl('http://assets.example.test', 'stories/123/cover.webp'),
    /secure origin/
  );
});
