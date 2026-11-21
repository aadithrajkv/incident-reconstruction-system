-- Run with `supabase test db` against a local database. All fixtures are inside
-- one transaction and are rolled back; do not run against a production project.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pilot-a@test.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pilot-b@test.invalid', '', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into private.pilot_members (user_id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002');
update public.profiles set home_grid_id = '11,22'
where user_id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set home_grid_id = '33,44'
where user_id = 'b0000000-0000-4000-8000-000000000002';

insert into public.grid_issues (id, grid_id, author_id, category, body, moderation_status)
values (
  'c0000000-0000-4000-8000-000000000003', '33,44',
  'b0000000-0000-4000-8000-000000000002', 'roads_paths', 'Pending issue belongs to B', 'pending_review'
);
insert into private.thought_seed_balances (user_id, balance, awarded_on)
values ('a0000000-0000-4000-8000-000000000001', 1, current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);

do $$
declare
  visible_pending integer;
  followed integer;
begin
  select count(*) into visible_pending
  from public.grid_issues
  where id = 'c0000000-0000-4000-8000-000000000003';
  if visible_pending <> 0 then
    raise exception 'RLS failure: user A read user B pending issue';
  end if;

  begin
    insert into public.thoughts (grid_id, body) values ('99,99', 'Wrong grid');
    raise exception 'RLS failure: user A posted to a grid other than their assigned home grid';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.thoughts (grid_id, body, moderation_status) values ('11,22', 'Attempted status edit', 'hidden');
    raise exception 'Privilege failure: user A set moderation_status';
  exception when insufficient_privilege then
    null;
  end;

  for i in 1..6 loop
    insert into public.grid_subscriptions (grid_id, label)
    values (format('100,%s', i), format('Test grid %s', i));
  end loop;
  select count(*) into followed from public.grid_subscriptions;
  if followed <> 6 then
    raise exception 'Fixture failure: expected six subscriptions, got %', followed;
  end if;

  begin
    insert into public.grid_subscriptions (grid_id, label) values ('100,7', 'Seventh grid');
    raise exception 'Constraint failure: user A exceeded the six-grid follow limit';
  exception when check_violation then
    null;
  end;
end;
$$;

reset role;
rollback;
select 'PASS: pending issue isolation, home-grid write scope, moderation column protection, and six-follow cap' as result;
