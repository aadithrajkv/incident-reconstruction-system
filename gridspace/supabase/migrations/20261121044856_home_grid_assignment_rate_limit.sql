-- Privileged rate-limit state for the trusted home-grid assignment endpoint.
-- Coordinates are deliberately not accepted by or written from this database function.
create table private.home_grid_assignment_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count between 0 and 13)
);

alter table private.home_grid_assignment_rate_limits enable row level security;
revoke all on table private.home_grid_assignment_rate_limits from public, anon, authenticated, service_role;

-- Called only by the Edge Function using the server-side secret/service role.
-- A single row per account provides an atomic fixed-window limit without a paid service.
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
  where user_id = p_user_id;

  if not found then
    return 'profile_missing';
  end if;

  return 'assigned';
end;
$$;

revoke all on function public.assign_home_grid_server_only(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_home_grid_server_only(uuid, text)
  to service_role;
