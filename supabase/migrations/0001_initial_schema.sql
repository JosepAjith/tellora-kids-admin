begin;

create schema if not exists private;
revoke all on schema private from public;

DO $$
begin
  if not exists (
    select 1 from pg_type where typname = 'story_status' and typnamespace = 'public'::regnamespace
  ) then
    create type public.story_status as enum ('draft', 'published');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'subscription_status' and typnamespace = 'public'::regnamespace
  ) then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired',
      'incomplete'
    );
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  avatar_object_key text check (
    avatar_object_key is null
    or (
      char_length(avatar_object_key) between 1 and 1024
      and avatar_object_key !~ '^/'
      and avatar_object_key !~ '(^|/)\.\.(/|$)'
    )
  ),
  avatar_url text check (avatar_url is null or avatar_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_name_ci_uidx
  on public.categories (lower(btrim(name)));
create index if not exists categories_catalog_idx
  on public.categories (is_active, sort_order, name);

create table if not exists public.languages (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  native_name text check (native_name is null or char_length(btrim(native_name)) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists languages_code_ci_uidx
  on public.languages (lower(code));
create unique index if not exists languages_name_ci_uidx
  on public.languages (lower(btrim(name)));
create index if not exists languages_catalog_idx
  on public.languages (is_active, name);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  category_id uuid not null references public.categories(id) on update cascade on delete restrict,
  language_id uuid not null references public.languages(id) on update cascade on delete restrict,
  age_group text not null check (char_length(btrim(age_group)) between 1 and 80),
  reading_time_minutes smallint not null check (reading_time_minutes between 1 and 1440),
  description text not null default '' check (char_length(description) <= 10000),
  moral text check (moral is null or char_length(moral) <= 4000),
  cover_object_key text check (
    cover_object_key is null
    or (
      char_length(cover_object_key) between 1 and 1024
      and cover_object_key !~ '^/'
      and cover_object_key !~ '(^|/)\.\.(/|$)'
    )
  ),
  cover_url text check (cover_url is null or cover_url ~* '^https?://'),
  music_object_key text check (
    music_object_key is null
    or (
      char_length(music_object_key) between 1 and 1024
      and music_object_key !~ '^/'
      and music_object_key !~ '(^|/)\.\.(/|$)'
    )
  ),
  music_url text check (music_url is null or music_url ~* '^https?://'),
  status public.story_status not null default 'draft',
  is_premium boolean not null default false,
  is_featured boolean not null default false,
  published_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stories_published_at_check check (status <> 'published' or published_at is not null)
);

create index if not exists stories_category_idx on public.stories (category_id);
create index if not exists stories_language_idx on public.stories (language_id);
create index if not exists stories_status_created_idx on public.stories (status, created_at desc);
create index if not exists stories_published_catalog_idx
  on public.stories (is_premium, is_featured, published_at desc)
  where status = 'published';

create table if not exists public.story_pages (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  position integer not null check (position >= 1),
  text text not null default '' check (char_length(text) <= 50000),
  image_object_key text check (
    image_object_key is null
    or (
      char_length(image_object_key) between 1 and 1024
      and image_object_key !~ '^/'
      and image_object_key !~ '(^|/)\.\.(/|$)'
    )
  ),
  image_url text check (image_url is null or image_url ~* '^https?://'),
  audio_object_key text check (
    audio_object_key is null
    or (
      char_length(audio_object_key) between 1 and 1024
      and audio_object_key !~ '^/'
      and audio_object_key !~ '(^|/)\.\.(/|$)'
    )
  ),
  audio_url text check (audio_url is null or audio_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_pages_story_position_uq
    unique (story_id, position) deferrable initially immediate
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_user_story_uq unique (user_id, story_id)
);

create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);
create index if not exists favorites_story_idx on public.favorites (story_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (char_length(btrim(provider)) between 1 and 60),
  provider_customer_id text check (
    provider_customer_id is null or char_length(btrim(provider_customer_id)) between 1 and 255
  ),
  provider_subscription_id text check (
    provider_subscription_id is null or char_length(btrim(provider_subscription_id)) between 1 and 255
  ),
  plan_code text not null check (char_length(btrim(plan_code)) between 1 and 120),
  status public.subscription_status not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_check check (
    current_period_start is null
    or current_period_end is null
    or current_period_end > current_period_start
  ),
  constraint subscriptions_access_period_check check (
    status not in ('trialing', 'active')
    or (current_period_start is not null and current_period_end is not null)
  )
);

create index if not exists subscriptions_provider_customer_idx
  on public.subscriptions (provider, provider_customer_id)
  where provider_customer_id is not null;
create unique index if not exists subscriptions_provider_subscription_uidx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists subscriptions_one_live_per_user_uidx
  on public.subscriptions (user_id)
  where status in ('trialing', 'active', 'past_due');
create index if not exists subscriptions_user_created_idx
  on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_access_idx
  on public.subscriptions (user_id, status, current_period_end);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prepare_story_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, v_actor);
    new.version := 1;
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
  end if;

  new.updated_by := coalesce(v_actor, new.updated_by);
  new.updated_at := now();

  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status <> 'published' then
      new.published_at := coalesce(new.published_at, now());
    elsif new.published_at is null then
      new.published_at := old.published_at;
    end if;
  else
    new.published_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function private.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

drop trigger if exists languages_set_updated_at on public.languages;
create trigger languages_set_updated_at
before update on public.languages
for each row execute function private.set_updated_at();

drop trigger if exists stories_prepare_write on public.stories;
create trigger stories_prepare_write
before insert or update on public.stories
for each row execute function private.prepare_story_write();

drop trigger if exists story_pages_set_updated_at on public.story_pages;
create trigger story_pages_set_updated_at
before update on public.story_pages
for each row execute function private.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function private.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users as administrator
    where administrator.user_id = (select auth.uid())
      and administrator.is_active
  );
$$;

comment on function public.is_admin() is
  'Returns whether the authenticated caller is an active administrator. It never accepts another user ID.';

create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions as subscription
    where subscription.user_id = (select auth.uid())
      and subscription.status in ('trialing', 'active')
      and coalesce(subscription.current_period_start, '-infinity'::timestamptz) <= now()
      and coalesce(subscription.current_period_end, 'infinity'::timestamptz) > now()
  );
$$;

comment on function public.has_active_subscription() is
  'Returns whether the authenticated caller currently has an access-granting subscription.';

create or replace function public.admin_save_story(
  p_story jsonb,
  p_pages jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_story_id uuid;
  v_existing public.stories%rowtype;
  v_saved public.stories%rowtype;
  v_page jsonb;
  v_page_id uuid;
  v_position integer := 0;
  v_pages_result jsonb;
  v_title text;
  v_slug text;
  v_category_id uuid;
  v_language_id uuid;
  v_age_group text;
  v_reading_time_minutes smallint;
  v_status public.story_status;
  v_expected_version integer;
  v_is_update boolean := false;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_story is null or jsonb_typeof(p_story) <> 'object' then
    raise exception 'p_story must be a JSON object.' using errcode = '22023';
  end if;

  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then
    raise exception 'p_pages must be a JSON array.' using errcode = '22023';
  end if;

  v_title := nullif(btrim(p_story ->> 'title'), '');
  v_slug := nullif(btrim(p_story ->> 'slug'), '');
  v_category_id := nullif(p_story ->> 'category_id', '')::uuid;
  v_language_id := nullif(p_story ->> 'language_id', '')::uuid;
  v_age_group := nullif(btrim(p_story ->> 'age_group'), '');
  v_reading_time_minutes := nullif(p_story ->> 'reading_time_minutes', '')::smallint;
  v_status := coalesce(nullif(p_story ->> 'status', '')::public.story_status, 'draft');

  if v_title is null then
    raise exception 'title is required.' using errcode = '22023';
  end if;
  if v_slug is null then
    raise exception 'slug is required.' using errcode = '22023';
  end if;
  if v_category_id is null then
    raise exception 'category_id is required.' using errcode = '22023';
  end if;
  if v_language_id is null then
    raise exception 'language_id is required.' using errcode = '22023';
  end if;
  if v_age_group is null then
    raise exception 'age_group is required.' using errcode = '22023';
  end if;
  if v_reading_time_minutes is null then
    raise exception 'reading_time_minutes is required.' using errcode = '22023';
  end if;

  if nullif(p_story ->> 'id', '') is not null then
    v_story_id := (p_story ->> 'id')::uuid;

    select *
    into v_existing
    from public.stories
    where id = v_story_id
    for update;

    v_is_update := found;
  else
    v_story_id := gen_random_uuid();
  end if;

  if v_is_update then

    if nullif(p_story ->> 'expected_version', '') is not null then
      v_expected_version := (p_story ->> 'expected_version')::integer;
      if v_existing.version <> v_expected_version then
        raise exception 'Story % was modified by another request.', v_story_id using errcode = '40001';
      end if;
    end if;

    update public.stories
    set
      slug = v_slug,
      title = v_title,
      category_id = v_category_id,
      language_id = v_language_id,
      age_group = v_age_group,
      reading_time_minutes = v_reading_time_minutes,
      description = coalesce(p_story ->> 'description', ''),
      moral = nullif(p_story ->> 'moral', ''),
      cover_object_key = nullif(p_story ->> 'cover_object_key', ''),
      cover_url = nullif(p_story ->> 'cover_url', ''),
      music_object_key = nullif(p_story ->> 'music_object_key', ''),
      music_url = nullif(p_story ->> 'music_url', ''),
      status = v_status,
      is_premium = coalesce((p_story ->> 'is_premium')::boolean, false),
      is_featured = coalesce((p_story ->> 'is_featured')::boolean, false),
      updated_by = v_actor
    where id = v_story_id
    returning * into v_saved;
  else
    if nullif(p_story ->> 'expected_version', '') is not null then
      raise exception 'Story % does not exist, so expected_version cannot be applied.', v_story_id
        using errcode = 'P0002';
    end if;

    insert into public.stories (
      id,
      slug,
      title,
      category_id,
      language_id,
      age_group,
      reading_time_minutes,
      description,
      moral,
      cover_object_key,
      cover_url,
      music_object_key,
      music_url,
      status,
      is_premium,
      is_featured,
      created_by,
      updated_by
    )
    values (
      v_story_id,
      v_slug,
      v_title,
      v_category_id,
      v_language_id,
      v_age_group,
      v_reading_time_minutes,
      coalesce(p_story ->> 'description', ''),
      nullif(p_story ->> 'moral', ''),
      nullif(p_story ->> 'cover_object_key', ''),
      nullif(p_story ->> 'cover_url', ''),
      nullif(p_story ->> 'music_object_key', ''),
      nullif(p_story ->> 'music_url', ''),
      v_status,
      coalesce((p_story ->> 'is_premium')::boolean, false),
      coalesce((p_story ->> 'is_featured')::boolean, false),
      v_actor,
      v_actor
    )
    returning * into v_saved;
  end if;

  delete from public.story_pages where story_id = v_story_id;

  for v_page in
    select value
    from jsonb_array_elements(p_pages)
  loop
    if jsonb_typeof(v_page) <> 'object' then
      raise exception 'Every page must be a JSON object.' using errcode = '22023';
    end if;

    v_position := v_position + 1;
    v_page_id := coalesce(nullif(v_page ->> 'id', '')::uuid, gen_random_uuid());

    insert into public.story_pages (
      id,
      story_id,
      position,
      text,
      image_object_key,
      image_url,
      audio_object_key,
      audio_url
    )
    values (
      v_page_id,
      v_story_id,
      v_position,
      coalesce(v_page ->> 'text', ''),
      nullif(v_page ->> 'image_object_key', ''),
      nullif(v_page ->> 'image_url', ''),
      nullif(v_page ->> 'audio_object_key', ''),
      nullif(v_page ->> 'audio_url', '')
    );
  end loop;

  select coalesce(
    jsonb_agg(to_jsonb(page_row) order by page_row.position),
    '[]'::jsonb
  )
  into v_pages_result
  from public.story_pages as page_row
  where page_row.story_id = v_story_id;

  return jsonb_build_object(
    'story', to_jsonb(v_saved),
    'pages', v_pages_result
  );
end;
$$;

comment on function public.admin_save_story(jsonb, jsonb) is
  'Atomically inserts or updates one story and replaces its ordered pages. The caller must be an active administrator.';

revoke all on function public.is_admin() from public;
revoke all on function public.has_active_subscription() from public;
revoke all on function public.admin_save_story(jsonb, jsonb) from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.prepare_story_write() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_active_subscription() to authenticated;
grant execute on function public.admin_save_story(jsonb, jsonb) to authenticated;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.languages enable row level security;
alter table public.stories enable row level security;
alter table public.story_pages enable row level security;
alter table public.favorites enable row level security;
alter table public.subscriptions enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.admin_users from public, anon, authenticated;
revoke all on table public.categories from public, anon, authenticated;
revoke all on table public.languages from public, anon, authenticated;
revoke all on table public.stories from public, anon, authenticated;
revoke all on table public.story_pages from public, anon, authenticated;
revoke all on table public.favorites from public, anon, authenticated;
revoke all on table public.subscriptions from public, anon, authenticated;

grant select on table public.categories, public.languages, public.stories, public.story_pages to anon;
grant select, insert, update, delete on table
  public.profiles,
  public.admin_users,
  public.categories,
  public.languages,
  public.stories,
  public.story_pages,
  public.favorites,
  public.subscriptions
to authenticated;

grant usage on type public.story_status, public.subscription_status to anon, authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_admin_all
on public.profiles
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy admin_users_admin_all
on public.admin_users
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy categories_public_active_select
on public.categories
for select
to anon, authenticated
using (is_active);

create policy categories_admin_all
on public.categories
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy languages_public_active_select
on public.languages
for select
to anon, authenticated
using (is_active);

create policy languages_admin_all
on public.languages
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy stories_public_published_select
on public.stories
for select
to anon, authenticated
using (status = 'published');

create policy stories_admin_all
on public.stories
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy story_pages_anon_free_select
on public.story_pages
for select
to anon
using (
  exists (
    select 1
    from public.stories as story
    where story.id = story_pages.story_id
      and story.status = 'published'
      and not story.is_premium
  )
);

create policy story_pages_authenticated_entitled_select
on public.story_pages
for select
to authenticated
using (
  exists (
    select 1
    from public.stories as story
    where story.id = story_pages.story_id
      and story.status = 'published'
      and (
        not story.is_premium
        or (select public.has_active_subscription())
      )
  )
);

create policy story_pages_admin_all
on public.story_pages
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy favorites_select_own
on public.favorites
for select
to authenticated
using (user_id = (select auth.uid()));

create policy favorites_insert_own_published
on public.favorites
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.stories as story
    where story.id = favorites.story_id
      and story.status = 'published'
  )
);

create policy favorites_delete_own
on public.favorites
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy favorites_admin_all
on public.favorites
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy subscriptions_admin_all
on public.subscriptions
for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

commit;
