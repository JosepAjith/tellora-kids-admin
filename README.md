# Tellora Kids Admin

This project is a fresh installation using the following architecture only:

Frontend/Admin → Supabase Auth → Supabase PostgreSQL → Cloudflare Worker → Cloudflare R2

The previous Firebase backend has been replaced with a clean Supabase + Cloudflare setup.

## Stack

- Frontend: React + Vite
- Authentication: Supabase Auth
- Database: Supabase PostgreSQL with RLS
- Media: Cloudflare R2
- Authorization layer: Cloudflare Worker for protected native-binding R2 uploads/deletes

## Local Supabase setup

With the Supabase CLI installed:

```sh
supabase start
supabase db reset --local
```

The local database contract lives under [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql), and the empty production-ready seed file is [supabase/seed.sql](supabase/seed.sql).

## Production bootstrap

After the app is connected to a new Supabase project, create an admin user in Supabase Auth and then grant admin access from SQL:

```sql
insert into public.admin_users (user_id)
values ('<auth-user-uuid>'::uuid);
```

## Required environment variables

Frontend/public values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key
VITE_R2_PUBLIC_BASE_URL=https://cdn.example.com
VITE_R2_WORKER_URL=https://tellora-worker.example.workers.dev
```

Worker/server values must be kept outside the frontend and configured in the Cloudflare Worker environment or secret manager.

## R2 and Worker notes

- Do not store R2 access keys or service-role secrets in Vite env variables.
- The browser sends its short-lived Supabase access token to the Worker for every image mutation.
- The worker validates the Supabase user and admin role before allowing upload or delete operations.
- The Worker writes and deletes through the native `STORY_ASSETS` R2 binding; no S3 access keys are required.
- Supabase stores R2 object keys for uploaded images. The frontend derives display URLs centrally from `VITE_R2_PUBLIC_BASE_URL`.
- Normal image reads go directly to the public R2 URL and are not proxied through the Worker.
