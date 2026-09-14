# Kids Story Assets API

This Cloudflare Worker authenticates Tellora administrators with Supabase and performs image mutations through the native `STORY_ASSETS` R2 binding. Normal image reads do not pass through the Worker; clients build public URLs from `VITE_R2_PUBLIC_BASE_URL` and the object key stored in Supabase.

The configured Cloudflare resources are:

- Worker: `kids-story-assets-api`
- R2 bucket: `kids-story-assets`
- R2 binding: `STORY_ASSETS`

## API

All mutation routes require `Authorization: Bearer <supabase-access-token>`. The Worker validates the session with Supabase and then calls the no-argument `is_admin` RPC using the same user token. It never accepts an admin flag or user ID from the browser.

### `GET /health`

Returns `{"ok":true,"service":"kids-story-assets-api"}`. It does not read or proxy an R2 object.

### `POST /assets` and `PUT /assets`

Upload a raw image body. Both query parameters are required:

```text
/assets?assetType=cover&storyPathId=<story-v4-uuid>
/assets?assetType=page&storyPathId=<story-v4-uuid>
```

Set `Content-Type` to `image/avif`, `image/jpeg`, `image/png`, or `image/webp`, and send the `File` itself as the request body. The Worker bounds the streamed body, rejects empty or compressed bodies, validates the image signature against the declared MIME type, generates the filename, and writes through `env.STORY_ASSETS.put(...)` with immutable public cache metadata.

Successful uploads return HTTP 201:

```json
{
  "asset": {
    "assetType": "cover",
    "contentType": "image/webp",
    "etag": "...",
    "key": "stories/<story-uuid>/cover/<asset-uuid>.webp",
    "size": 245901,
    "storyPathId": "<story-uuid>"
  }
}
```

Page keys use `stories/<story-uuid>/pages/<asset-uuid>.<ext>`. Persist `asset.key`; derive its display URL in the frontend rather than persisting a deployment-specific R2 domain.

### `DELETE /assets`

Delete one validated image key:

```json
{ "key": "stories/<story-uuid>/cover/<asset-uuid>.webp" }
```

Or a bounded list:

```json
{ "keys": ["stories/<story-uuid>/cover/<asset-uuid>.webp"] }
```

The request must use `Content-Type: application/json`. URLs, traversal segments, unsupported extensions, and keys outside the generated story namespace are rejected before R2 is called. R2 deletion is idempotent, so the response reports accepted keys rather than whether each key existed beforehand.

### `DELETE /stories/<story-v4-uuid>/assets`

Deletes every object under `stories/<story-v4-uuid>/`. Call this only after the corresponding Supabase story deletion succeeds. The Worker repeatedly lists and bulk-deletes the exact server-validated prefix, so cover and page images not present in the final database snapshot are cleaned up as well.

## Supabase authorization contract

For every mutation, the Worker:

1. Sends the bearer JWT and `SUPABASE_PUBLISHABLE_KEY` to `GET <SUPABASE_URL>/auth/v1/user`.
2. Rejects an invalid or expired session.
3. Calls `POST <SUPABASE_URL>/rest/v1/rpc/<SUPABASE_ADMIN_RPC>` with that exact JWT.
4. Proceeds only when the RPC response is the JSON boolean `true`.

The repository migration defines `public.is_admin()` without caller-supplied arguments. It derives identity from `auth.uid()` and checks active membership in `public.admin_users`. Do not configure a Supabase service-role key for this Worker or for Vite.

## Configuration

`wrangler.toml` contains only non-secret configuration and the native binding. Keep `ALLOWED_ORIGINS` as an exact comma-separated allowlist. HTTP origins are accepted only for localhost; use HTTPS for production.

For local development, copy `.dev.vars.example` to `.dev.vars` and supply only the Supabase publishable key. For production, configure it as a Worker secret:

```powershell
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

R2 access-key and secret-access-key credentials are not used. Once no other integration depends on an old R2 API token, revoke that token in Cloudflare rather than retaining unused credentials.

The Worker CORS response allows the route-specific `POST`, `PUT`, or `DELETE` method and the `Authorization` and `Content-Type` headers. Because uploads now go through the Worker, the bucket does not need a browser CORS policy for image mutations.

## Replacement and deletion sequence

For replacement:

1. Upload the new object.
2. Save its key in Supabase.
3. After the database save succeeds, delete the obsolete key.
4. If a follow-up read confirms the database save failed, delete the newly
   uploaded key. If the save outcome cannot be verified, retain it rather than
   risk deleting an object the database now references.

For permanent story deletion, delete the Supabase story first and call the story-prefix cleanup endpoint only after that deletion succeeds.

## Local checks and deployment

Run from this directory:

```powershell
npm install
npm run typecheck
npm test
npm run dev
```

Authenticate Wrangler if needed, then deploy the configured existing Worker:

```powershell
npx wrangler login
npx wrangler deploy
```

Confirm that Wrangler reports `kids-story-assets-api` and the `STORY_ASSETS` binding to `kids-story-assets`. Copy the exact HTTPS `workers.dev` URL printed by deployment into `VITE_R2_WORKER_URL`; do not guess the account subdomain.
