-- A restore key transfers pilot data to a fresh anonymous Auth user. It does
-- not recreate the former Auth UUID or grant a durable human identity.
create table private.pilot_recovery_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create table private.pilot_recovery_attempt_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count smallint not null default 0 check (request_count between 0 and 11)
);
alter table private.pilot_recovery_tokens enable row level security;
alter table private.pilot_recovery_attempt_limits enable row level security;
revoke all on table private.pilot_recovery_tokens,
  private.pilot_recovery_attempt_limits from public, anon, authenticated, service_role;

create or replace function public.store_pilot_recovery_token_server_only(
  p_user_id uuid,
  p_token_digest text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$'
    or not exists (select 1 from private.pilot_members where user_id = p_user_id)
  then
    raise exception 'Recovery key cannot be issued.' using errcode = '42501';
  end if;
  insert into private.pilot_recovery_tokens (user_id, token_digest)
  values (p_user_id, p_token_digest)
  on conflict (user_id) do update
    set token_digest = excluded.token_digest, created_at = now();
  return true;
end;
$$;
revoke all on function public.store_pilot_recovery_token_server_only(uuid, text)
  from public, anon, authenticated;
grant execute on function public.store_pilot_recovery_token_server_only(uuid, text)
  to service_role;

create or replace function public.restore_pilot_data_server_only(
  p_new_user_id uuid,
  p_token_digest text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_user_id uuid;
  v_attempts smallint;
begin
  if p_new_user_id is null or p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid restore request.' using errcode = '22023';
  end if;
  if exists (select 1 from private.pilot_members where user_id = p_new_user_id) then
    raise exception 'This session already has pilot access.' using errcode = '23514';
  end if;

  insert into private.pilot_recovery_attempt_limits as attempts (
    user_id, window_started_at, request_count
  ) values (p_new_user_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when attempts.window_started_at < now() - interval '1 hour' then now()
        else attempts.window_started_at
      end,
      request_count = case
        when attempts.window_started_at < now() - interval '1 hour' then 1
        else least(attempts.request_count + 1, 11)
      end
  returning request_count into v_attempts;
  if v_attempts > 10 then
    raise exception 'Too many restore attempts.' using errcode = '53300';
  end if;

  delete from private.pilot_recovery_tokens
  where token_digest = p_token_digest
  returning user_id into v_old_user_id;
  if v_old_user_id is null then
    raise exception 'Restore key is invalid or already used.' using errcode = '22023';
  end if;
  if not exists (select 1 from private.pilot_members where user_id = v_old_user_id) then
    raise exception 'The former pilot account is no longer available.' using errcode = '22023';
  end if;
  if exists (select 1 from private.moderators where user_id = v_old_user_id) then
    raise exception 'Moderator accounts cannot use anonymous restore keys.' using errcode = '42501';
  end if;

  insert into public.profiles (user_id) values (p_new_user_id)
  on conflict (user_id) do nothing;

  -- Keep the business/offers composite ownership reference valid as one unit.
  update public.offers set owner_id = p_new_user_id where owner_id = v_old_user_id;
  update public.business_profiles set owner_id = p_new_user_id where owner_id = v_old_user_id;
  update public.thoughts set author_id = p_new_user_id where author_id = v_old_user_id;
  update public.grid_issues set author_id = p_new_user_id where author_id = v_old_user_id;
  update public.grid_subscriptions set user_id = p_new_user_id where user_id = v_old_user_id;
  update public.reports set reporter_id = p_new_user_id where reporter_id = v_old_user_id;
  update private.thought_seed_balances set user_id = p_new_user_id where user_id = v_old_user_id;
  update public.profiles as target
  set display_name = former.display_name,
      home_grid_id = former.home_grid_id,
      updated_at = now()
  from public.profiles as former
  where target.user_id = p_new_user_id and former.user_id = v_old_user_id;
  delete from public.profiles where user_id = v_old_user_id;
  update private.pilot_members set user_id = p_new_user_id where user_id = v_old_user_id;
  delete from private.pilot_invite_attempt_limits where user_id = v_old_user_id;
  delete from private.home_grid_assignment_rate_limits where user_id = v_old_user_id;
  delete from private.pilot_recovery_attempt_limits where user_id = v_old_user_id;
  return v_old_user_id;
end;
$$;
revoke all on function public.restore_pilot_data_server_only(uuid, text)
  from public, anon, authenticated;
grant execute on function public.restore_pilot_data_server_only(uuid, text)
  to service_role;

alter table public.offers
  alter constraint offers_business_id_owner_id_fkey deferrable initially deferred;
