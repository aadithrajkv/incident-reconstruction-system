-- Keep the write-capable implementation outside PostgREST's exposed schema.
create or replace function private.refresh_my_thought_seeds()
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
revoke all on function private.refresh_my_thought_seeds() from public, anon;
grant execute on function private.refresh_my_thought_seeds() to authenticated;

create or replace function public.refresh_my_thought_seeds()
returns smallint
language sql
security invoker
set search_path = ''
as $$
  select private.refresh_my_thought_seeds();
$$;
revoke all on function public.refresh_my_thought_seeds() from public, anon;
grant execute on function public.refresh_my_thought_seeds() to authenticated;
