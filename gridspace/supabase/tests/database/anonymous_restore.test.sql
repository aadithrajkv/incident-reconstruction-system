-- Verify one-use restore transfers shared rows from an old anonymous user to a
-- fresh one, without preserving raw coordinates or the old Auth identity.
-- Run against a non-production pilot database; all fixtures roll back.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('d0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'restore-old@test.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('e0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'restore-new@test.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into private.pilot_members (user_id)
values ('d0000000-0000-4000-8000-000000000004');
update public.profiles set home_grid_id = '12,34'
where user_id = 'd0000000-0000-4000-8000-000000000004';
insert into private.thought_seed_balances (user_id, balance, awarded_on)
values ('d0000000-0000-4000-8000-000000000004', 1, current_date);
insert into private.pilot_recovery_tokens (user_id, token_digest)
values ('d0000000-0000-4000-8000-000000000004', repeat('a', 64));
insert into public.business_profiles (id, owner_id, public_name, category)
values (
  '11000000-0000-4000-8000-000000000011',
  'd0000000-0000-4000-8000-000000000004',
  'Restore fixture business', 'test'
);
insert into public.offers (id, business_id, owner_id, grid_id, message)
values (
  '12000000-0000-4000-8000-000000000012',
  '11000000-0000-4000-8000-000000000011',
  'd0000000-0000-4000-8000-000000000004',
  '12,34', 'Restore fixture offer'
);
insert into public.grid_issues (id, grid_id, author_id, category, body)
values (
  '13000000-0000-4000-8000-000000000013', '12,34',
  'd0000000-0000-4000-8000-000000000004', 'roads_paths', 'Restore fixture issue'
);
insert into public.reports (id, reporter_id, issue_id, reason)
values (
  '14000000-0000-4000-8000-000000000014',
  'd0000000-0000-4000-8000-000000000004',
  '13000000-0000-4000-8000-000000000013', 'other'
);

-- Use the test connection's privileged role for fixtures; production client
-- grants and RLS policies are not changed by this rollback-only test.
set local role service_role;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":true}',
  true
);
insert into public.thoughts (id, grid_id, body)
values ('f0000000-0000-4000-8000-000000000006', '12,34', 'Restore transfer fixture');
insert into public.grid_subscriptions (grid_id, label)
values ('56,78', 'Restore transfer fixture');
reset role;

do $$
declare
  old_user uuid;
begin
  select public.restore_pilot_data_server_only(
    'e0000000-0000-4000-8000-000000000005', repeat('a', 64)
  ) into old_user;
  if old_user <> 'd0000000-0000-4000-8000-000000000004' then
    raise exception 'Restore returned the wrong former user.';
  end if;
  if not exists (select 1 from private.pilot_members where user_id = 'e0000000-0000-4000-8000-000000000005') then
    raise exception 'Pilot membership was not transferred.';
  end if;
  if exists (select 1 from private.pilot_members where user_id = old_user) then
    raise exception 'Former user retained pilot membership.';
  end if;
  if not exists (
    select 1 from public.thoughts
    where id = 'f0000000-0000-4000-8000-000000000006'
      and author_id = 'e0000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Thought ownership was not transferred.';
  end if;
  if not exists (
    select 1 from public.grid_subscriptions
    where user_id = 'e0000000-0000-4000-8000-000000000005' and grid_id = '56,78'
  ) then
    raise exception 'Grid follows were not transferred.';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = 'e0000000-0000-4000-8000-000000000005' and home_grid_id = '12,34'
  ) then
    raise exception 'Home grid was not transferred.';
  end if;
  if not exists (
    select 1 from public.business_profiles
    where id = '11000000-0000-4000-8000-000000000011'
      and owner_id = 'e0000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Business profile ownership was not transferred.';
  end if;
  if not exists (
    select 1 from public.offers
    where id = '12000000-0000-4000-8000-000000000012'
      and owner_id = 'e0000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Offer ownership was not transferred.';
  end if;
  if not exists (
    select 1 from public.grid_issues
    where id = '13000000-0000-4000-8000-000000000013'
      and author_id = 'e0000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Issue ownership was not transferred.';
  end if;
  if not exists (
    select 1 from public.reports
    where id = '14000000-0000-4000-8000-000000000014'
      and reporter_id = 'e0000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Report ownership was not transferred.';
  end if;
  if exists (select 1 from private.pilot_recovery_tokens where token_digest = repeat('a', 64)) then
    raise exception 'Restore token was not consumed.';
  end if;
end;
$$;

rollback;
select 'PASS: one-use restore transfers membership, thought, issue, report, follow, home grid, business, and offer; consumes token' as result;
