-- Thotox India pilot: user-owned content, local businesses, offers, follows.
-- Sensitive permissions are enforced here; browser-supplied user IDs/status are not trusted.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 48),
  -- Set only by a trusted server action after validating the location flow.
  home_grid_id text check (home_grid_id is null or home_grid_id ~ '^-?[0-9]+,-?[0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  grid_id text not null check (grid_id ~ '^-?[0-9]+,-?[0-9]+$'),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 140),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  moderation_status text not null default 'published'
    check (moderation_status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at > created_at)
);
create index thoughts_grid_live_idx on public.thoughts (grid_id, created_at desc)
  where moderation_status = 'published';
create index thoughts_author_idx on public.thoughts (author_id, created_at desc);

create table public.grid_subscriptions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  grid_id text not null check (grid_id ~ '^-?[0-9]+,-?[0-9]+$'),
  label text not null default '' check (char_length(label) <= 32),
  created_at timestamptz not null default now(),
  primary key (user_id, grid_id)
);
create index grid_subscriptions_grid_idx on public.grid_subscriptions (grid_id);

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  public_name text not null check (char_length(btrim(public_name)) between 1 and 80),
  category text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 400),
  latitude double precision,
  longitude double precision,
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  verification_status text not null default 'pending_review'
    check (verification_status in ('pending_review', 'approved', 'rejected', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check ((latitude is null and longitude is null) or
         (latitude between -90 and 90 and longitude between -180 and 180))
);
create index business_profiles_owner_idx on public.business_profiles (owner_id, created_at desc);
create index business_profiles_approved_idx on public.business_profiles (verification_status, id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  owner_id uuid not null default auth.uid(),
  grid_id text not null check (grid_id ~ '^-?[0-9]+,-?[0-9]+$'),
  message text not null check (char_length(btrim(message)) between 1 and 240),
  listing_image_path text,
  active_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(active_hours) = 'object'),
  moderation_status text not null default 'pending_review'
    check (moderation_status in ('pending_review', 'approved', 'rejected', 'paused')),
  starts_at timestamptz not null default statement_timestamp(),
  ends_at timestamptz not null default (statement_timestamp() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, owner_id)
    references public.business_profiles (id, owner_id) on delete cascade,
  check (ends_at > starts_at and ends_at <= starts_at + interval '30 days')
);
create index offers_grid_live_idx on public.offers (grid_id, starts_at, ends_at)
  where moderation_status = 'approved';
create index offers_owner_idx on public.offers (owner_id, created_at desc);

-- Create a minimal private profile when Supabase Auth creates a user. Never copy
-- user-editable metadata into authorization fields.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Serialize per-user follows so concurrent requests cannot bypass the six-grid cap.
create or replace function private.enforce_six_grid_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );
  select count(*) into existing_count
  from public.grid_subscriptions
  where user_id = new.user_id and grid_id <> new.grid_id;
  if existing_count >= 6 then
    raise exception 'A user can follow at most six grids.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_six_grid_subscription_limit() from public, anon, authenticated;
create trigger grid_subscriptions_max_six
  before insert on public.grid_subscriptions
  for each row execute function private.enforce_six_grid_subscription_limit();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger business_profiles_set_updated_at before update on public.business_profiles
  for each row execute function private.set_updated_at();
create trigger offers_set_updated_at before update on public.offers
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.thoughts enable row level security;
alter table public.grid_subscriptions enable row level security;
alter table public.business_profiles enable row level security;
alter table public.offers enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy thoughts_select_published_or_own on public.thoughts
  for select to authenticated using (
    (moderation_status = 'published' and expires_at > now())
    or author_id = (select auth.uid())
  );
create policy thoughts_insert_home_grid on public.thoughts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and moderation_status = 'published'
    and grid_id = (
      select p.home_grid_id from public.profiles as p
      where p.user_id = (select auth.uid())
    )
  );
create policy thoughts_delete_own on public.thoughts
  for delete to authenticated using (author_id = (select auth.uid()));

create policy subscriptions_select_own on public.grid_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy subscriptions_insert_own on public.grid_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy subscriptions_update_own on public.grid_subscriptions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy subscriptions_delete_own on public.grid_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy businesses_select_approved_or_own on public.business_profiles
  for select to authenticated using (
    verification_status = 'approved' or owner_id = (select auth.uid())
  );
create policy businesses_insert_own_pending on public.business_profiles
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and verification_status = 'pending_review'
  );
create policy businesses_update_own on public.business_profiles
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy businesses_delete_own on public.business_profiles
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy offers_select_approved_or_own on public.offers
  for select to authenticated using (
    (moderation_status = 'approved' and starts_at <= now() and ends_at > now())
    or owner_id = (select auth.uid())
  );
create policy offers_insert_for_approved_business on public.offers
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and moderation_status = 'pending_review'
    and exists (
      select 1 from public.business_profiles as b
      where b.id = business_id
        and b.owner_id = (select auth.uid())
        and b.verification_status = 'approved'
    )
  );
create policy offers_update_own_pending on public.offers
  for update to authenticated using (
    owner_id = (select auth.uid()) and moderation_status = 'pending_review'
  ) with check (
    owner_id = (select auth.uid()) and moderation_status = 'pending_review'
  );
create policy offers_delete_own on public.offers
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Explicit grants: no anonymous access, and clients cannot write moderation state,
-- authorship, expiry, or trusted location context.
revoke all on table public.profiles, public.thoughts, public.grid_subscriptions,
  public.business_profiles, public.offers from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, delete on public.thoughts to authenticated;
grant insert (grid_id, body, emoji) on public.thoughts to authenticated;
grant select, insert, delete on public.grid_subscriptions to authenticated;
grant insert (grid_id, label) on public.grid_subscriptions to authenticated;
grant update (label) on public.grid_subscriptions to authenticated;
grant select, delete on public.business_profiles to authenticated;
grant insert (public_name, category, description, latitude, longitude, opening_hours)
  on public.business_profiles to authenticated;
grant update (public_name, category, description, latitude, longitude, opening_hours)
  on public.business_profiles to authenticated;
grant select, delete on public.offers to authenticated;
grant insert (business_id, grid_id, message, listing_image_path, active_hours, starts_at, ends_at)
  on public.offers to authenticated;
grant update (message, listing_image_path, active_hours, starts_at, ends_at)
  on public.offers to authenticated;
