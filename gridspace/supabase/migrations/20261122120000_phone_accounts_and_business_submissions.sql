-- Phone OTP accounts keep the existing Auth UUID and shared-data ownership.
-- This migration does not enable SMS delivery or change hosted Auth settings.
begin;

alter table public.profiles add column username text
  not null default ('neighbor_' || replace(gen_random_uuid()::text, '-', ''));
alter table public.profiles add constraint profiles_username_key unique (username);
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^neighbor_[a-f0-9]{32}$');
-- Existing column-level grants intentionally do not permit username updates.

create or replace function public.ensure_phone_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null or not exists (
    select 1 from auth.users where id = v_user_id
      and phone_confirmed_at is not null and phone ~ '^91[6-9][0-9]{9}$'
      and not coalesce(is_anonymous, false)
  ) then
    raise exception 'Verify an Indian mobile number before continuing.' using errcode = '42501';
  end if;
  insert into public.profiles(user_id) values (v_user_id) on conflict (user_id) do nothing;
  insert into private.pilot_members(user_id) values (v_user_id) on conflict (user_id) do nothing;
  -- An old anonymous restore credential must not transfer a phone account.
  delete from private.pilot_recovery_tokens where user_id = v_user_id;
  select username into v_username from public.profiles where user_id = v_user_id;
  return jsonb_build_object('username', v_username);
end;
$$;
revoke all on function public.ensure_phone_account() from public, anon;
grant execute on function public.ensure_phone_account() to authenticated;

create or replace function private.retire_restore_key_after_phone_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.phone_confirmed_at is not null then
    delete from private.pilot_recovery_tokens where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.retire_restore_key_after_phone_verification() from public, anon, authenticated;
create trigger retire_anonymous_restore_key
  after update of phone_confirmed_at on auth.users
  for each row execute function private.retire_restore_key_after_phone_verification();

-- Business submission uses the previously assigned grid, never a client owner ID.
alter table public.business_profiles add column grid_id text
  check (grid_id is null or grid_id ~ '^-?[0-9]+,-?[0-9]+$');
alter table public.business_profiles add column local_business_attested_at timestamptz;
create index business_profiles_grid_idx on public.business_profiles(grid_id, verification_status);

create or replace function private.business_grid_id(p_lat double precision, p_lng double precision)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_rm double precision := (1000 / cos(20 * pi() / 180)) / sqrt(3);
  v_x double precision := 6378137 * p_lng * pi() / 180;
  v_y double precision := 6378137 * ln(tan(pi()/4 + p_lat*pi()/360));
  v_q double precision;
  v_r double precision;
  v_s double precision;
  v_a double precision;
  v_b double precision;
  v_c double precision;
begin
  v_q := (sqrt(3)/3*v_x-v_y/3)/v_rm;
  v_r := (2.0/3*v_y)/v_rm;
  v_s := -v_q-v_r;
  v_a := floor(v_q+0.5); v_b := floor(v_r+0.5); v_c := floor(v_s+0.5);
  if abs(v_a-v_q)>abs(v_b-v_r) and abs(v_a-v_q)>abs(v_c-v_s) then v_a := -v_b-v_c;
  elsif abs(v_b-v_r)>abs(v_c-v_s) then v_b := -v_a-v_c;
  end if;
  return v_a::bigint::text || ',' || v_b::bigint::text;
end;
$$;
revoke all on function private.business_grid_id(double precision, double precision) from public, anon, authenticated;

-- No direct browser insert/edit can bypass the transaction or re-review path.
revoke insert, update on public.business_profiles, public.offers from authenticated;
revoke insert (public_name,category,description,latitude,longitude,opening_hours),
  update (public_name,category,description,latitude,longitude,opening_hours)
  on public.business_profiles from authenticated;
revoke insert (business_id,grid_id,message,listing_image_path,active_hours,starts_at,ends_at),
  update (message,listing_image_path,active_hours,starts_at,ends_at)
  on public.offers from authenticated;

create or replace function public.submit_business_offer(
  p_name text, p_kind text, p_message text, p_lat double precision,
  p_lng double precision, p_open text, p_close text, p_local boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_grid text;
  v_business uuid;
  v_offer uuid;
  v_count integer;
begin
  if not private.is_pilot_member() then
    raise exception 'Sign in before submitting a business.' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80
    or p_message is null or char_length(btrim(p_message)) not between 1 and 240
    or p_kind is null or p_kind not in ('listed','street') or p_local is distinct from true
    or p_open is null or p_close is null
    or p_open !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_open = p_close
    or p_lat is null or p_lng is null or not (p_lat between -85 and 85)
    or not (p_lng between -180 and 180)
  then raise exception 'Check the business details, hours and local-business confirmation.' using errcode='22023'; end if;
  select home_grid_id into v_grid from public.profiles where user_id=v_user_id;
  if v_grid is null or private.business_grid_id(p_lat,p_lng) <> v_grid then
    raise exception 'Confirm your grid and place the business inside it.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 7));
  select count(*) into v_count from public.offers
    where owner_id=v_user_id and ends_at>now() and moderation_status in ('pending_review','approved');
  if v_count >= 3 then raise exception 'You may have up to three active or pending updates.' using errcode='23514'; end if;
  insert into public.business_profiles(owner_id,public_name,category,latitude,longitude,opening_hours,grid_id,local_business_attested_at)
  values(v_user_id,btrim(p_name),p_kind,p_lat,p_lng,
    jsonb_build_object('open',p_open,'close',p_close,'timezone','Asia/Kolkata'),v_grid,now())
  returning id into v_business;
  insert into public.offers(business_id,owner_id,grid_id,message,active_hours)
  values(v_business,v_user_id,v_grid,btrim(p_message),
    jsonb_build_object('open',p_open,'close',p_close,'timezone','Asia/Kolkata'))
  returning id into v_offer;
  return jsonb_build_object('businessId',v_business,'offerId',v_offer,'status','pending_review');
end;
$$;
revoke all on function public.submit_business_offer(text,text,text,double precision,double precision,text,text,boolean) from public, anon;
grant execute on function public.submit_business_offer(text,text,text,double precision,double precision,text,text,boolean) to authenticated;

create policy businesses_moderator_review on public.business_profiles
  for select to authenticated using (private.is_moderator());
create policy offers_moderator_review on public.offers
  for select to authenticated using (private.is_moderator());
create table private.business_review_actions(
  id bigint generated always as identity primary key,
  moderator_id uuid references auth.users(id) on delete set null,
  business_id uuid not null,
  offer_id uuid not null,
  action text not null check(action in ('approve','hide')),
  created_at timestamptz not null default now()
);
alter table private.business_review_actions enable row level security;
revoke all on private.business_review_actions from public,anon,authenticated,service_role;

create or replace function public.review_business_offer(p_offer_id uuid,p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_business uuid;
begin
  if not private.is_pilot_member() or not private.is_moderator() then
    raise exception 'Moderator permission required.' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('approve','hide') then
    raise exception 'Choose approve or hide.' using errcode='22023';
  end if;
  select business_id into v_business from public.offers where id=p_offer_id for update;
  if not found then raise exception 'Offer not found.' using errcode='22023'; end if;
  update public.business_profiles set verification_status=case when p_action='approve' then 'approved' else 'paused' end
    where id=v_business;
  update public.offers set moderation_status=case when p_action='approve' then 'approved' else 'paused' end
    where business_id=v_business;
  insert into private.business_review_actions(moderator_id,business_id,offer_id,action)
    values(auth.uid(),v_business,p_offer_id,p_action);
  return p_action;
end;
$$;
revoke all on function public.review_business_offer(uuid,text) from public,anon;
grant execute on function public.review_business_offer(uuid,text) to authenticated;
commit;
