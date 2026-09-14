# Tellora Kids Supabase database

This directory is the version-controlled database contract for the admin and
reader applications. Cloudflare R2 remains the media store; Postgres stores the
R2 object key. Existing `*_url` columns remain for legacy or non-R2 media, but
new R2 images should not duplicate an environment-specific delivery domain.

## Local workflow

With the Supabase CLI and a Docker-compatible runtime installed:

```sh
supabase start
supabase db reset --local
```

The reset applies `migrations/0001_initial_schema.sql` and then the intentionally
empty `seed.sql`. The local API is configured for `http://localhost:5173`.

Do not use `--linked` with destructive database commands unless a remote reset
is explicitly intended. Review a generated diff before running `supabase db push`.

## Bootstrap the first administrator

The browser cannot grant administrator access. First create/sign in the user
through Supabase Auth, obtain that user's UUID, and run the following once from
a privileged migration or the Supabase SQL editor:

```sql
insert into public.admin_users (user_id)
values ('<auth-user-uuid>'::uuid);
```

After bootstrap, an existing active administrator can manage memberships under
RLS. Removing or disabling the final administrator requires another privileged
database operation to recover access.

## Story save RPC

Administrators create and update stories through:

```text
public.admin_save_story(p_story jsonb, p_pages jsonb = '[]') -> jsonb
```

For creation, either omit `p_story.id` or provide a caller-generated UUID that
does not exist yet. Reserving the UUID before the call lets the client use a
stable story-scoped R2 object-key prefix while uploading assets. An existing UUID
updates that story; include its last-read `expected_version` so a stale edit fails
rather than overwriting a newer one. Supplying `expected_version` for a missing
UUID fails instead of silently inserting. Required fields are `slug`, `title`,
`category_id`, `language_id`, `age_group`, and `reading_time_minutes`. The
optional status defaults to `draft`.

Page array order is authoritative and becomes `story_pages.position`. A page may
include `id`, `text`, `image_object_key`, `image_url`, `audio_object_key`, and
`audio_url`. The operation replaces all pages and returns:

```json
{
  "story": { "id": "...", "version": 1 },
  "pages": [{ "id": "...", "position": 1 }]
}
```

The function checks the caller with `public.is_admin()` and commits the story
and pages atomically. Validation, constraint, or page failures roll back the
whole call.

## Access model

- Anyone may read active categories/languages and published story metadata.
- Anyone may read pages belonging to published free stories.
- Signed-in users with a current `trialing` or `active` subscription may also
  read pages for published premium stories.
- Users may read/update their profile, manage their favorites, and read their
  own subscription records.
- Active administrators have CRUD access to application tables and may call the
  atomic story-save RPC.
- Subscription writes normally come from a trusted billing webhook/backend.
  Never expose a Supabase service-role key in either frontend.

R2 image uploads and deletes go through the Cloudflare Worker with the caller's
Supabase access token. The Worker validates the session and active administrator
membership, then writes through its native R2 binding. Persist the returned
object key only after upload succeeds; clients derive the public URL from their
configured R2 base URL. RLS protects the database row, not a publicly shared R2
object URL, so changing premium-media reads to private access would require a
separate authenticated delivery design.
