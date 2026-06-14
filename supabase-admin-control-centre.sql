-- Guinness Budgeting Admin Control Centre setup
-- Run this in the Supabase SQL Editor, then wait 30-60 seconds for the
-- PostgREST schema cache before refreshing the app.
--
-- This file creates the server-side admin role, admin claim mode, safe
-- user-management RPCs, account blocking support and audit logging. It does
-- not expose service-role keys, turn off RLS globally or make profiles public.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text not null,
  username_normalized text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  blocked boolean not null default false,
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references auth.users(id) on delete set null,
  add column if not exists last_activity_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

update public.profiles
set role = coalesce(nullif(role, ''), 'user'),
    blocked = coalesce(blocked, false),
    updated_at = coalesce(updated_at, now()),
    last_activity_at = coalesce(last_activity_at, updated_at, created_at, now());

alter table public.profiles enable row level security;

drop policy if exists "GH users can read own profile" on public.profiles;
drop policy if exists "GH users can insert own profile" on public.profiles;
drop policy if exists "GH users can update own profile" on public.profiles;

create policy "GH users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "GH users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "GH users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update (email, username, username_normalized, updated_at, last_activity_at) on public.profiles to authenticated;

create table if not exists public.gh_admin_settings (
  id boolean primary key default true,
  admin_claim_enabled boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint gh_admin_settings_singleton check (id = true)
);

insert into public.gh_admin_settings (id, admin_claim_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.gh_admin_settings enable row level security;

create table if not exists public.gh_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.gh_admin_audit_log enable row level security;

create table if not exists public.gh_cloud_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_key text not null default 'primary',
  backup_data jsonb not null,
  backup_hash text,
  app_version text,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gh_cloud_backups_user_key unique (user_id, backup_key)
);

alter table public.gh_cloud_backups enable row level security;

create or replace function public.gh_is_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
  );
$$;

create or replace function public.gh_is_blocked(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.blocked = true
  );
$$;

create or replace function public.gh_log_admin_action(action_name text, action_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_email_value text;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  select email into actor_email_value
  from public.profiles
  where id = auth.uid();

  insert into public.gh_admin_audit_log (actor_id, actor_email, action, details)
  values (auth.uid(), actor_email_value, action_name, coalesce(action_details, '{}'::jsonb));
end;
$$;

drop function if exists public.gh_claim_admin();
drop function if exists public.gh_set_admin_claim_mode(boolean);
drop function if exists public.gh_admin_audit_recent(integer);
drop function if exists public.gh_admin_list_users();
drop function if exists public.gh_admin_set_user_role(uuid, text);
drop function if exists public.gh_admin_set_user_blocked(uuid, boolean);
drop function if exists public.gh_get_admin_access_state();

create or replace function public.gh_get_admin_access_state()
returns table(
  current_user_id uuid,
  current_email text,
  "current_role" text,
  is_admin boolean,
  admin_exists boolean,
  admin_count integer,
  profile_count integer,
  admin_claim_enabled boolean,
  is_blocked boolean
)
language sql
security definer
set search_path = public
as $$
  select
    current_app_user.id as current_user_id,
    p.email as current_email,
    coalesce(p.role, 'user') as "current_role",
    coalesce(p.role = 'admin', false) as is_admin,
    exists (select 1 from public.profiles admin_profile where admin_profile.role = 'admin') as admin_exists,
    (select count(*)::integer from public.profiles admin_profile where admin_profile.role = 'admin') as admin_count,
    case
      when coalesce(p.role = 'admin', false) then (select count(*)::integer from public.profiles)
      else 0
    end as profile_count,
    coalesce((select s.admin_claim_enabled from public.gh_admin_settings s where s.id = true), false) as admin_claim_enabled,
    coalesce(p.blocked, false) as is_blocked
  from (select auth.uid() as id) current_app_user
  left join public.profiles p on p.id = current_app_user.id
  where current_app_user.id is not null;
$$;

create or replace function public.gh_claim_admin()
returns table(
  current_user_id uuid,
  current_email text,
  "current_role" text,
  is_admin boolean,
  admin_exists boolean,
  admin_count integer,
  profile_count integer,
  admin_claim_enabled boolean,
  is_blocked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_admin_count integer;
  claim_enabled boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  select count(*)::integer into existing_admin_count
  from public.profiles
  where profiles.role = 'admin';

  select coalesce(s.admin_claim_enabled, false) into claim_enabled
  from public.gh_admin_settings s
  where s.id = true;

  if existing_admin_count > 0 and not coalesce(claim_enabled, false) then
    raise exception 'Admin claim mode is off';
  end if;

  insert into public.profiles (id, email, username, username_normalized, role)
  values (
    auth.uid(),
    coalesce(auth.jwt()->>'email', ''),
    coalesce(split_part(auth.jwt()->>'email', '@', 1), 'admin'),
    lower(coalesce(split_part(auth.jwt()->>'email', '@', 1), 'admin')),
    'user'
  )
  on conflict (id) do nothing;

  update public.profiles
  set role = 'admin',
      updated_at = now()
  where id = auth.uid();

  update public.gh_admin_settings s
  set admin_claim_enabled = false,
      updated_by = auth.uid(),
      updated_at = now()
  where s.id = true;

  perform public.gh_log_admin_action(
    'admin_claimed',
    jsonb_build_object('previous_admin_count', existing_admin_count, 'admin_claim_mode_turned_off', true)
  );

  return query select * from public.gh_get_admin_access_state();
end;
$$;

create or replace function public.gh_set_admin_claim_mode(enabled boolean)
returns table(
  current_user_id uuid,
  current_email text,
  "current_role" text,
  is_admin boolean,
  admin_exists boolean,
  admin_count integer,
  profile_count integer,
  admin_claim_enabled boolean,
  is_blocked boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if not public.gh_is_admin(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  update public.gh_admin_settings s
  set admin_claim_enabled = coalesce(enabled, false),
      updated_by = auth.uid(),
      updated_at = now()
  where s.id = true;

  perform public.gh_log_admin_action(
    'admin_claim_mode_changed',
    jsonb_build_object('enabled', coalesce(enabled, false))
  );

  return query select * from public.gh_get_admin_access_state();
end;
$$;

create or replace function public.gh_admin_audit_recent(limit_count integer default 30)
returns table(
  id uuid,
  actor_id uuid,
  actor_email text,
  action text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if not public.gh_is_admin(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  return query
    select a.id, a.actor_id, a.actor_email, a.action, a.details, a.created_at
    from public.gh_admin_audit_log a
    order by a.created_at desc
    limit greatest(1, least(coalesce(limit_count, 30), 100));
end;
$$;

create or replace function public.gh_admin_list_users()
returns table(
  id uuid,
  username text,
  email text,
  role text,
  blocked boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_activity_at timestamptz,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if not public.gh_is_admin(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  return query
    select
      p.id,
      p.username,
      p.email,
      p.role,
      coalesce(p.blocked, false) as blocked,
      p.created_at,
      p.updated_at,
      coalesce(p.last_activity_at, max(b.created_at), p.updated_at, p.created_at) as last_activity_at,
      p.role = 'admin' as is_admin
    from public.profiles p
    left join public.gh_cloud_backups b on b.user_id = p.id
    group by p.id, p.username, p.email, p.role, p.blocked, p.created_at, p.updated_at, p.last_activity_at
    order by p.created_at desc;
end;
$$;

create or replace function public.gh_admin_set_user_role(target_user_id uuid, new_role text)
returns table(
  id uuid,
  username text,
  email text,
  role text,
  is_admin boolean,
  blocked boolean,
  blocked_at timestamptz,
  blocked_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_role text;
  admin_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if not public.gh_is_admin(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  if target_user_id is null or new_role not in ('user', 'admin') then
    raise exception 'Invalid admin action';
  end if;

  select p.role into target_profile_role
  from public.profiles p
  where p.id = target_user_id;

  if target_profile_role is null then
    raise exception 'User not found';
  end if;

  select count(*)::integer into admin_count
  from public.profiles
  where profiles.role = 'admin';

  if target_profile_role = 'admin' and new_role = 'user' and admin_count <= 1 then
    raise exception 'Cannot remove the last admin.';
  end if;

  update public.profiles p
  set role = new_role,
      updated_at = now()
  where p.id = target_user_id;

  perform public.gh_log_admin_action(
    case when new_role = 'admin' then 'user_promoted_to_admin' else 'user_demoted_to_user' end,
    jsonb_build_object('target_user_id', target_user_id, 'previous_role', target_profile_role, 'new_role', new_role)
  );

  return query
    select p.id, p.username, p.email, p.role, p.role = 'admin', p.blocked, p.blocked_at, p.blocked_by, p.created_at, p.updated_at
    from public.profiles p
    where p.id = target_user_id;
end;
$$;

create or replace function public.gh_admin_set_user_blocked(target_user_id uuid, target_blocked boolean)
returns table(
  id uuid,
  username text,
  email text,
  role text,
  is_admin boolean,
  blocked boolean,
  blocked_at timestamptz,
  blocked_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_role text;
  target_current_blocked boolean;
  admin_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if not public.gh_is_admin(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  if target_user_id is null then
    raise exception 'Invalid admin action';
  end if;

  select p.role, coalesce(p.blocked, false)
    into target_profile_role, target_current_blocked
  from public.profiles p
  where p.id = target_user_id;

  if target_profile_role is null then
    raise exception 'User not found';
  end if;

  select count(*)::integer into admin_count
  from public.profiles
  where profiles.role = 'admin' and coalesce(profiles.blocked, false) = false;

  if target_profile_role = 'admin' and target_blocked = true and admin_count <= 1 then
    raise exception 'Cannot block the last admin.';
  end if;

  update public.profiles p
  set blocked = coalesce(target_blocked, false),
      blocked_at = case when coalesce(target_blocked, false) then now() else null end,
      blocked_by = case when coalesce(target_blocked, false) then auth.uid() else null end,
      updated_at = now()
  where p.id = target_user_id;

  perform public.gh_log_admin_action(
    case when coalesce(target_blocked, false) then 'user_blocked' else 'user_unblocked' end,
    jsonb_build_object('target_user_id', target_user_id, 'previous_blocked', target_current_blocked, 'blocked', coalesce(target_blocked, false))
  );

  return query
    select p.id, p.username, p.email, p.role, p.role = 'admin', p.blocked, p.blocked_at, p.blocked_by, p.created_at, p.updated_at
    from public.profiles p
    where p.id = target_user_id;
end;
$$;

drop policy if exists "gh_cloud_backups_select_own" on public.gh_cloud_backups;
drop policy if exists "gh_cloud_backups_insert_own" on public.gh_cloud_backups;
drop policy if exists "gh_cloud_backups_update_own" on public.gh_cloud_backups;
drop policy if exists "gh_cloud_backups_delete_own" on public.gh_cloud_backups;

create policy "gh_cloud_backups_select_own"
on public.gh_cloud_backups
for select
using (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create policy "gh_cloud_backups_insert_own"
on public.gh_cloud_backups
for insert
with check (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create policy "gh_cloud_backups_update_own"
on public.gh_cloud_backups
for update
using (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()))
with check (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create policy "gh_cloud_backups_delete_own"
on public.gh_cloud_backups
for delete
using (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

revoke all on function public.gh_is_admin(uuid) from public;
revoke all on function public.gh_is_blocked(uuid) from public;
revoke all on function public.gh_log_admin_action(text, jsonb) from public;
revoke all on function public.gh_get_admin_access_state() from public;
revoke all on function public.gh_claim_admin() from public;
revoke all on function public.gh_set_admin_claim_mode(boolean) from public;
revoke all on function public.gh_admin_audit_recent(integer) from public;
revoke all on function public.gh_admin_list_users() from public;
revoke all on function public.gh_admin_set_user_role(uuid, text) from public;
revoke all on function public.gh_admin_set_user_blocked(uuid, boolean) from public;

grant execute on function public.gh_get_admin_access_state() to authenticated;
grant execute on function public.gh_is_blocked(uuid) to authenticated;
grant execute on function public.gh_claim_admin() to authenticated;
grant execute on function public.gh_set_admin_claim_mode(boolean) to authenticated;
grant execute on function public.gh_admin_audit_recent(integer) to authenticated;
grant execute on function public.gh_admin_list_users() to authenticated;
grant execute on function public.gh_admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.gh_admin_set_user_blocked(uuid, boolean) to authenticated;
