-- Anonymous sessions receive no shared pilot access until they redeem a
-- one-use invite. No name, email, phone, or location is stored by this flow.
create table private.pilot_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table private.pilot_invite_codes (
  code_digest text primary key check (code_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses smallint not null default 1 check (max_uses between 1 and 100),
  use_count smallint not null default 0 check (use_count between 0 and max_uses)
);

create table private.pilot_invite_attempt_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count smallint not null default 0 check (request_count between 0 and 11)
);

alter table private.pilot_members enable row level security;
alter table private.pilot_invite_codes enable row level security;
alter table private.pilot_invite_attempt_limits enable row level security;
revoke all on table private.pilot_members, private.pilot_invite_codes,
  private.pilot_invite_attempt_limits from public, anon, authenticated, service_role;

create or replace function private.is_pilot_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.pilot_members as member
    where member.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_pilot_member() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_pilot_member() to authenticated;

create or replace function public.pilot_access_status()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_pilot_member();
$$;
revoke all on function public.pilot_access_status() from public, anon;
grant execute on function public.pilot_access_status() to authenticated;

-- Only the Edge Function's server-side secret may redeem a hashed invite.
create or replace function public.redeem_pilot_invite_server_only(
  p_user_id uuid,
  p_code_digest text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count smallint;
begin
  if p_user_id is null or p_code_digest is null
    or p_code_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid invite redemption.' using errcode = '22023';
  end if;

  if exists (select 1 from private.pilot_members where user_id = p_user_id) then
    return 'already_enrolled';
  end if;

  insert into private.pilot_invite_attempt_limits as attempts (
    user_id, window_started_at, request_count
  ) values (p_user_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when attempts.window_started_at < now() - interval '1 hour' then now()
        else attempts.window_started_at
      end,
      request_count = case
        when attempts.window_started_at < now() - interval '1 hour' then 1
        else least(attempts.request_count + 1, 11)
      end
  returning request_count into v_count;

  if v_count > 10 then
    return 'rate_limited';
  end if;

  update private.pilot_invite_codes
  set use_count = use_count + 1
  where code_digest = p_code_digest
    and use_count < max_uses
    and (expires_at is null or expires_at > now());

  if not found then
    return 'invalid_invite';
  end if;

  insert into private.pilot_members (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  return 'enrolled';
end;
$$;
revoke all on function public.redeem_pilot_invite_server_only(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.redeem_pilot_invite_server_only(uuid, text)
  to service_role;

-- Close the existing grid-assignment path to accounts that have not redeemed
-- an invite. This only adds a condition; existing RLS policies are untouched.
create or replace function public.assign_home_grid_server_only(
  p_user_id uuid,
  p_grid_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if p_user_id is null
    or p_grid_id is null
    or char_length(p_grid_id) > 30
    or p_grid_id !~ '^-?[0-9]+,-?[0-9]+$'
  then
    raise exception 'Invalid home grid assignment.' using errcode = '22023';
  end if;

  insert into private.home_grid_assignment_rate_limits as rate_limit (
    user_id, window_started_at, request_count
  ) values (p_user_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when rate_limit.window_started_at < now() - interval '1 hour' then now()
        else rate_limit.window_started_at
      end,
      request_count = case
        when rate_limit.window_started_at < now() - interval '1 hour' then 1
        else least(rate_limit.request_count + 1, 13)
      end
  returning request_count into v_request_count;

  if v_request_count > 12 then
    return 'rate_limited';
  end if;

  update public.profiles
  set home_grid_id = p_grid_id,
      updated_at = now()
  where user_id = p_user_id
    and exists (
      select 1 from private.pilot_members as member
      where member.user_id = p_user_id
    );

  if not found then
    return 'not_enrolled';
  end if;

  return 'assigned';
end;
$$;
revoke all on function public.assign_home_grid_server_only(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_home_grid_server_only(uuid, text)
  to service_role;

-- Restrictive policies compose with the current owner/grid policies and gate
-- every shared table on one-time invite redemption for authenticated sessions.
create policy pilot_member_gate_profiles on public.profiles
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy pilot_member_gate_thoughts on public.thoughts
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy pilot_member_gate_subscriptions on public.grid_subscriptions
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy pilot_member_gate_business_profiles on public.business_profiles
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy pilot_member_gate_offers on public.offers
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy pilot_member_gate_grid_issues on public.grid_issues
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy pilot_member_gate_issue_images on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id <> 'grid-issue-images'
    or (select private.is_pilot_member())
  )
  with check (
    bucket_id <> 'grid-issue-images'
    or (select private.is_pilot_member())
  );
