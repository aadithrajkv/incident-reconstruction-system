create or replace function private.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.reporter_id is null or new.reporter_id <> (select auth.uid()) then
    raise exception 'Report author must match the signed-in user.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.reporter_id::text, 0));
  select count(*) into v_count
  from public.reports
  where reporter_id = new.reporter_id
    and created_at > now() - interval '1 hour';
  if v_count >= 10 then
    raise exception 'Report limit reached. Try again later.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_report_rate_limit() from public, anon, authenticated;
create trigger reports_enforce_rate_limit
  before insert on public.reports
  for each row execute function private.enforce_report_rate_limit();
