-- Keep the browser preview's thought rules when writes move to shared storage.
-- The balance is private and every insert consumes a seed in the same transaction.
create table private.thought_seed_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance smallint not null default 0 check (balance between 0 and 3),
  awarded_on date not null default current_date,
  updated_at timestamptz not null default now()
);
alter table private.thought_seed_balances enable row level security;
revoke all on table private.thought_seed_balances from public, anon, authenticated, service_role;

create or replace function public.refresh_my_thought_seeds()
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_balance smallint;
begin
  if v_user is null or not private.is_pilot_member() then
    raise exception 'Pilot membership required.' using errcode = '42501';
  end if;
  insert into private.thought_seed_balances (user_id, balance, awarded_on)
  values (v_user, 1, current_date)
  on conflict (user_id) do update
    set balance = case
          when private.thought_seed_balances.awarded_on < current_date
            then least(3, private.thought_seed_balances.balance + 1)
          else private.thought_seed_balances.balance
        end,
        awarded_on = greatest(private.thought_seed_balances.awarded_on, current_date),
        updated_at = now()
  returning balance into v_balance;
  return v_balance;
end;
$$;
revoke all on function public.refresh_my_thought_seeds() from public, anon;
grant execute on function public.refresh_my_thought_seeds() to authenticated;

create or replace function private.enforce_shared_thought_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_active_count integer;
begin
  if v_user is null or new.author_id <> v_user then
    raise exception 'Thought author must match the signed-in user.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.grid_id, 0));
  update private.thought_seed_balances
  set balance = balance - 1, updated_at = now()
  where user_id = v_user and balance > 0;
  if not found then
    raise exception 'No thought seeds available.' using errcode = '23514';
  end if;

  select count(*) into v_active_count
  from public.thoughts
  where grid_id = new.grid_id
    and moderation_status = 'published'
    and expires_at > now();
  if v_active_count >= 15 then
    delete from public.thoughts
    where id = (
      select id from public.thoughts
      where grid_id = new.grid_id
        and moderation_status = 'published'
        and expires_at > now()
      order by created_at asc, id asc
      limit 1
    );
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_shared_thought_rules() from public, anon, authenticated;
create trigger thoughts_enforce_shared_rules
  before insert on public.thoughts
  for each row execute function private.enforce_shared_thought_rules();
