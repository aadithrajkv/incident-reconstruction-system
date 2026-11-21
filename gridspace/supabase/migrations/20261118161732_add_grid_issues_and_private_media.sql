-- Grid-scoped civic issue reports. New reports stay private to their author
-- until a moderator publishes them. Exact device coordinates are not stored.
create table public.grid_issues (
  id uuid primary key default gen_random_uuid(),
  grid_id text not null check (grid_id ~ '^-?[0-9]+,-?[0-9]+$'),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in (
    'roads_paths', 'water', 'waste', 'lighting', 'accessibility', 'safety', 'other'
  )),
  body text not null check (char_length(btrim(body)) between 1 and 400),
  image_path text,
  moderation_status text not null default 'pending_review'
    check (moderation_status in ('pending_review', 'published', 'hidden', 'resolved', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (expires_at > created_at),
  check (image_path is null or image_path ~ '^[0-9a-f-]+/-?[0-9]+,-?[0-9]+/[0-9a-f-]+[.](webp|jpg|png)$')
);

create index grid_issues_live_idx on public.grid_issues (grid_id, created_at desc)
  where moderation_status in ('published', 'resolved');
create index grid_issues_author_idx on public.grid_issues (author_id, created_at desc);
create trigger grid_issues_set_updated_at before update on public.grid_issues
  for each row execute function private.set_updated_at();

alter table public.grid_issues enable row level security;
create policy grid_issues_select_published_or_own on public.grid_issues
  for select to authenticated using (
    (moderation_status in ('published', 'resolved') and expires_at > now())
    or author_id = (select auth.uid())
  );
create policy grid_issues_insert_current_grid_pending on public.grid_issues
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and moderation_status = 'pending_review'
    and grid_id = (
      select p.home_grid_id from public.profiles as p
      where p.user_id = (select auth.uid())
    )
  );
create policy grid_issues_delete_own_pending on public.grid_issues
  for delete to authenticated using (
    author_id = (select auth.uid()) and moderation_status = 'pending_review'
  );
revoke all on table public.grid_issues from public, anon, authenticated;
grant select on public.grid_issues to authenticated;
grant insert (grid_id, category, body, image_path) on public.grid_issues to authenticated;
grant delete on public.grid_issues to authenticated;

-- Issue photos are optional, private objects. They can be read only after the
-- associated report is published, or by the uploader. Uploads are constrained
-- to the uploader's current grid and a small image-only bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grid-issue-images', 'grid-issue-images', false, 2097152,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy grid_issue_images_read_published_or_own on storage.objects
  for select to authenticated using (
    bucket_id = 'grid-issue-images'
    and exists (
      select 1 from public.grid_issues as i
      where i.image_path = storage.objects.name
        and (i.moderation_status in ('published', 'resolved') or i.author_id = (select auth.uid()))
    )
  );
create policy grid_issue_images_insert_own_grid on storage.objects
  for insert to authenticated with check (
    bucket_id = 'grid-issue-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = (
      select p.home_grid_id from public.profiles as p
      where p.user_id = (select auth.uid())
    )
  );
create policy grid_issue_images_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'grid-issue-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
