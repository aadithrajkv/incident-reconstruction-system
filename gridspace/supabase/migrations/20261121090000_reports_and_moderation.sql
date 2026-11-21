create table private.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.moderators enable row level security;
revoke all on table private.moderators from public, anon, authenticated, service_role;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thought_id uuid references public.thoughts(id) on delete cascade,
  issue_id uuid references public.grid_issues(id) on delete cascade,
  reason text not null check (reason in ('safety', 'harassment', 'spam', 'personal_data', 'misinformation', 'other')),
  details text not null default '' check (char_length(details) <= 400),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  check ((thought_id is not null)::integer + (issue_id is not null)::integer = 1)
);
create unique index reports_reporter_thought_once_idx on public.reports (reporter_id, thought_id)
  where thought_id is not null;
create unique index reports_reporter_issue_once_idx on public.reports (reporter_id, issue_id)
  where issue_id is not null;
create index reports_pending_idx on public.reports (status, created_at desc)
  where status = 'pending';

create table private.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('thought', 'issue', 'report')),
  target_id uuid not null,
  action text not null check (action in ('publish', 'hide', 'resolve', 'dismiss')),
  created_at timestamptz not null default now()
);
alter table private.moderation_actions enable row level security;
revoke all on table private.moderation_actions from public, anon, authenticated, service_role;

create or replace function private.is_moderator(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.moderators where user_id = p_user_id);
$$;
revoke all on function private.is_moderator(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_moderator(uuid) to authenticated;

create or replace function public.moderator_access_status()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_moderator((select auth.uid())); $$;
revoke all on function public.moderator_access_status() from public, anon;
grant execute on function public.moderator_access_status() to authenticated;

alter table public.reports enable row level security;
create policy reports_pilot_member_gate on public.reports
  as restrictive for all to authenticated
  using ((select private.is_pilot_member()))
  with check ((select private.is_pilot_member()));
create policy reports_read_reporter_or_moderator on public.reports
  for select to authenticated using (
    reporter_id = (select auth.uid()) or private.is_moderator((select auth.uid()))
  );
create policy reports_insert_for_visible_other_content on public.reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and (
      (thought_id is not null and exists (
        select 1 from public.thoughts as t
        where t.id = thought_id and t.author_id <> (select auth.uid())
          and t.moderation_status = 'published' and t.expires_at > now()
      ))
      or
      (issue_id is not null and exists (
        select 1 from public.grid_issues as i
        where i.id = issue_id and i.author_id <> (select auth.uid())
          and i.moderation_status in ('published', 'resolved') and i.expires_at > now()
      ))
    )
  );
revoke all on table public.reports from public, anon, authenticated;
grant select on public.reports to authenticated;
grant insert (thought_id, issue_id, reason, details) on public.reports to authenticated;

create policy thoughts_select_moderator on public.thoughts
  for select to authenticated using (private.is_moderator((select auth.uid())));
create policy grid_issues_select_moderator on public.grid_issues
  for select to authenticated using (private.is_moderator((select auth.uid())));

create or replace function public.moderate_content_server_only(
  p_moderator_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_moderator_id is null or not private.is_moderator(p_moderator_id) then
    raise exception 'Moderator permission required.' using errcode = '42501';
  end if;
  if p_target_type not in ('thought', 'issue') or p_action not in ('publish', 'hide') then
    raise exception 'Invalid moderation action.' using errcode = '22023';
  end if;

  if p_target_type = 'thought' then
    update public.thoughts
    set moderation_status = case when p_action = 'publish' then 'published' else 'hidden' end
    where id = p_target_id and moderation_status in ('published', 'hidden')
    returning moderation_status into v_status;
  else
    update public.grid_issues
    set moderation_status = case when p_action = 'publish' then 'published' else 'hidden' end
    where id = p_target_id and moderation_status in ('pending_review', 'published', 'hidden', 'resolved')
    returning moderation_status into v_status;
  end if;
  if not found then
    raise exception 'Content was not found or cannot take that action.' using errcode = 'P0002';
  end if;
  insert into private.moderation_actions (moderator_id, target_type, target_id, action)
  values (p_moderator_id, p_target_type, p_target_id, p_action);
  with closed_reports as (
    update public.reports
    set status = 'resolved', reviewed_at = now(), reviewed_by = p_moderator_id
    where status = 'pending'
      and ((p_target_type = 'thought' and thought_id = p_target_id)
        or (p_target_type = 'issue' and issue_id = p_target_id))
    returning id
  )
  insert into private.moderation_actions (moderator_id, target_type, target_id, action)
  select p_moderator_id, 'report', id, 'resolve' from closed_reports;
  return v_status;
end;
$$;
revoke all on function public.moderate_content_server_only(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.moderate_content_server_only(uuid, text, uuid, text)
  to service_role;
