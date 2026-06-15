-- GH Budgeting auth profile + cloud backup setup
-- Run this in Supabase SQL Editor after creating a project.
-- Security model: the browser uses only the public anon/publishable key.
-- Row Level Security below ensures signed-in users can access only rows where
-- auth.uid() matches their own profile id or cloud-backup user_id.

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
  add column if not exists role text not null default 'user';

alter table public.profiles
  add column if not exists blocked boolean not null default false;

alter table public.profiles
  add column if not exists blocked_at timestamptz;

alter table public.profiles
  add column if not exists blocked_by uuid references auth.users(id) on delete set null;

alter table public.profiles
  add column if not exists last_activity_at timestamptz;

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

update public.profiles
set role = coalesce(nullif(role, ''), 'user'),
    blocked = coalesce(blocked, false),
    updated_at = coalesce(updated_at, now()),
    last_activity_at = coalesce(last_activity_at, updated_at, created_at, now());

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

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
  id boolean primary key default true check (id),
  admin_claim_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.gh_admin_settings (id, admin_claim_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.gh_admin_settings enable row level security;

create table if not exists public.gh_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.gh_admin_audit_log enable row level security;

create or replace function public.gh_is_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
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
    select 1 from public.profiles p
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

create table if not exists public.gh_feature_suggestions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_email text,
  submitted_username text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'planned', 'in_progress', 'done', 'rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gh_feature_suggestions
  drop constraint if exists gh_feature_suggestions_status_check;
alter table public.gh_feature_suggestions
  add constraint gh_feature_suggestions_status_check
  check (status in ('new', 'reviewed', 'planned', 'in_progress', 'done', 'rejected'));

alter table public.gh_feature_suggestions enable row level security;
revoke all on public.gh_feature_suggestions from anon, authenticated;

create table if not exists public.gh_feature_suggestion_votes (
  suggestion_id uuid not null references public.gh_feature_suggestions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

alter table public.gh_feature_suggestion_votes enable row level security;
revoke all on public.gh_feature_suggestion_votes from anon, authenticated;

drop function if exists public.gh_submit_feature_suggestion(text);
drop function if exists public.gh_list_feature_suggestions(text);
drop function if exists public.gh_vote_feature_suggestion(uuid, smallint);
drop function if exists public.gh_admin_list_feature_suggestions(text);
drop function if exists public.gh_admin_update_feature_suggestion(uuid, text, text);

create or replace function public.gh_submit_feature_suggestion(p_message text)
returns table(
  id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_email text;
  profile_username text;
  new_suggestion_id uuid;
  new_status text;
  new_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'Enter a suggestion first';
  end if;

  select p.email, p.username
    into profile_email, profile_username
  from public.profiles p
  where p.id = auth.uid();

  insert into public.gh_feature_suggestions (submitted_by, submitted_email, submitted_username, message)
  values (auth.uid(), profile_email, profile_username, left(trim(p_message), 2000))
  returning gh_feature_suggestions.id, gh_feature_suggestions.status, gh_feature_suggestions.created_at
  into new_suggestion_id, new_status, new_created_at;

  return query select new_suggestion_id, new_status, new_created_at;
end;
$$;

create or replace function public.gh_list_feature_suggestions(p_status text default null)
returns table(
  id uuid,
  message text,
  status text,
  admin_note text,
  submitted_username text,
  submitted_email text,
  created_at timestamptz,
  updated_at timestamptz,
  up_votes integer,
  down_votes integer,
  my_vote integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  return query
    select
      s.id,
      s.message,
      s.status,
      s.admin_note,
      s.submitted_username,
      case when s.submitted_by = auth.uid() then s.submitted_email else null end,
      s.created_at,
      s.updated_at,
      coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::integer as up_votes,
      coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::integer as down_votes,
      coalesce((select mv.vote::integer from public.gh_feature_suggestion_votes mv where mv.suggestion_id = s.id and mv.user_id = auth.uid()), 0) as my_vote
    from public.gh_feature_suggestions s
    left join public.gh_feature_suggestion_votes v on v.suggestion_id = s.id
    where p_status is null or s.status = p_status
    group by s.id
    order by coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0) desc, s.created_at desc
    limit 200;
end;
$$;

create or replace function public.gh_vote_feature_suggestion(p_suggestion_id uuid, p_vote smallint)
returns table(suggestion_id uuid, vote integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if p_vote not in (-1, 1) then
    raise exception 'Invalid vote';
  end if;

  if not exists (select 1 from public.gh_feature_suggestions s where s.id = p_suggestion_id) then
    raise exception 'Suggestion not found';
  end if;

  insert into public.gh_feature_suggestion_votes (suggestion_id, user_id, vote)
  values (p_suggestion_id, auth.uid(), p_vote)
  on conflict (suggestion_id, user_id) do update
    set vote = excluded.vote,
        updated_at = now();

  return query select p_suggestion_id, p_vote::integer;
end;
$$;

create or replace function public.gh_admin_list_feature_suggestions(p_status text default null)
returns table(
  id uuid,
  message text,
  status text,
  admin_note text,
  submitted_by uuid,
  submitted_email text,
  submitted_username text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  up_votes integer,
  down_votes integer
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
      s.id, s.message, s.status, s.admin_note, s.submitted_by, s.submitted_email, s.submitted_username, s.created_at, s.updated_at, s.reviewed_at,
      coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::integer as up_votes,
      coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::integer as down_votes
    from public.gh_feature_suggestions s
    left join public.gh_feature_suggestion_votes v on v.suggestion_id = s.id
    where p_status is null or s.status = p_status
    group by s.id
    order by s.created_at desc
    limit 200;
end;
$$;

create or replace function public.gh_admin_update_feature_suggestion(p_suggestion_id uuid, p_status text, p_admin_note text default null)
returns table(
  id uuid,
  message text,
  status text,
  admin_note text,
  submitted_by uuid,
  submitted_email text,
  submitted_username text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  up_votes integer,
  down_votes integer
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

  if p_status not in ('new', 'reviewed', 'planned', 'in_progress', 'done', 'rejected') then
    raise exception 'Invalid suggestion status';
  end if;

  update public.gh_feature_suggestions s
  set status = p_status,
      admin_note = coalesce(p_admin_note, s.admin_note),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where s.id = p_suggestion_id;

  perform public.gh_log_admin_action(
    'feature_suggestion_updated',
    jsonb_build_object('suggestion_id', p_suggestion_id, 'status', p_status)
  );

  return query
    select
      s.id, s.message, s.status, s.admin_note, s.submitted_by, s.submitted_email, s.submitted_username, s.created_at, s.updated_at, s.reviewed_at,
      coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::integer as up_votes,
      coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::integer as down_votes
    from public.gh_feature_suggestions s
    left join public.gh_feature_suggestion_votes v on v.suggestion_id = s.id
    where s.id = p_suggestion_id
    group by s.id;
end;
$$;

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
revoke all on function public.gh_submit_feature_suggestion(text) from public;
revoke all on function public.gh_list_feature_suggestions(text) from public;
revoke all on function public.gh_vote_feature_suggestion(uuid, smallint) from public;
revoke all on function public.gh_admin_list_feature_suggestions(text) from public;
revoke all on function public.gh_admin_update_feature_suggestion(uuid, text, text) from public;

grant execute on function public.gh_get_admin_access_state() to authenticated;
grant execute on function public.gh_is_blocked(uuid) to authenticated;
grant execute on function public.gh_claim_admin() to authenticated;
grant execute on function public.gh_set_admin_claim_mode(boolean) to authenticated;
grant execute on function public.gh_admin_audit_recent(integer) to authenticated;
grant execute on function public.gh_admin_list_users() to authenticated;
grant execute on function public.gh_admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.gh_admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function public.gh_submit_feature_suggestion(text) to authenticated;
grant execute on function public.gh_list_feature_suggestions(text) to authenticated;
grant execute on function public.gh_vote_feature_suggestion(uuid, smallint) to authenticated;
grant execute on function public.gh_admin_list_feature_suggestions(text) to authenticated;
grant execute on function public.gh_admin_update_feature_suggestion(uuid, text, text) to authenticated;

create or replace function public.gh_resolve_username_login(username_input text)
returns table(email text)
language sql
security definer
set search_path = public
as $$
  select p.email
  from public.profiles p
  where p.username_normalized = lower(trim(username_input))
  limit 1;
$$;

revoke all on function public.gh_resolve_username_login(text) from public;
grant execute on function public.gh_resolve_username_login(text) to anon, authenticated;

create or replace function public.gh_handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_username text;
  profile_username_normalized text;
begin
  profile_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  profile_username_normalized := lower(regexp_replace(profile_username, '\\s+', '', 'g'));

  insert into public.profiles (id, email, username, username_normalized, last_activity_at)
  values (new.id, new.email, profile_username, profile_username_normalized, now());

  return new;
end;
$$;

drop trigger if exists gh_on_auth_user_created on auth.users;
create trigger gh_on_auth_user_created
  after insert on auth.users
  for each row execute function public.gh_handle_new_user_profile();

create table if not exists public.gh_cloud_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text,
  backup_label text,
  backup_format_version text,
  app_version text,
  data_schema_version text,
  counts jsonb not null default '{}'::jsonb,
  backup_json jsonb not null,
  source text not null default 'manual-cloud-backup',
  client_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gh_cloud_backups enable row level security;

drop policy if exists "GH users can read own backups" on public.gh_cloud_backups;
drop policy if exists "GH users can insert own backups" on public.gh_cloud_backups;
drop policy if exists "GH users can update own backups" on public.gh_cloud_backups;
drop policy if exists "GH users can delete own backups" on public.gh_cloud_backups;

create policy "GH users can read own backups"
  on public.gh_cloud_backups for select
  using (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create policy "GH users can insert own backups"
  on public.gh_cloud_backups for insert
  with check (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create policy "GH users can update own backups"
  on public.gh_cloud_backups for update
  using (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()))
  with check (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create policy "GH users can delete own backups"
  on public.gh_cloud_backups for delete
  using (auth.uid() = user_id and not public.gh_is_blocked(auth.uid()));

create index if not exists gh_cloud_backups_user_created_idx
  on public.gh_cloud_backups (user_id, created_at desc);

-- Guinness Budgeting House Sharing setup
-- Run after the main Supabase setup. Safe to rerun.
-- Uses RPC functions for writes so the frontend never needs service-role keys
-- and shared users only receive house-scoped JSON snapshots.

create table if not exists public.gh_houses (
  id text primary key,
  house_data jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gh_house_people (
  id text primary key,
  house_id text not null references public.gh_houses(id) on delete cascade,
  person_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gh_house_contributions (
  id text primary key,
  house_id text not null references public.gh_houses(id) on delete cascade,
  contribution_data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gh_house_ownership_splits (
  id text primary key,
  house_id text not null references public.gh_houses(id) on delete cascade,
  split_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gh_house_members (
  id uuid primary key default gen_random_uuid(),
  house_id text not null references public.gh_houses(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (house_id, user_id)
);

create table if not exists public.gh_house_invites (
  id uuid primary key default gen_random_uuid(),
  house_id text not null references public.gh_houses(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid,
  invited_by uuid not null,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gh_houses enable row level security;
alter table public.gh_house_people enable row level security;
alter table public.gh_house_contributions enable row level security;
alter table public.gh_house_ownership_splits enable row level security;
alter table public.gh_house_members enable row level security;
alter table public.gh_house_invites enable row level security;

revoke all on public.gh_houses from anon, authenticated;
revoke all on public.gh_house_people from anon, authenticated;
revoke all on public.gh_house_contributions from anon, authenticated;
revoke all on public.gh_house_ownership_splits from anon, authenticated;
revoke all on public.gh_house_members from anon, authenticated;
revoke all on public.gh_house_invites from anon, authenticated;

create or replace function public.gh_user_house_role(p_house_id text, p_user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
as $
  select m.role
  from public.gh_house_members m
  where m.house_id = p_house_id
    and m.user_id = p_user_id
    and m.status = 'active'
  limit 1;
$;

create or replace function public.gh_user_can_access_house(p_house_id text, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $
  select public.gh_user_house_role(p_house_id, p_user_id) is not null;
$;

drop function if exists public.gh_house_upsert_snapshot(text, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.gh_house_list_accessible();
drop function if exists public.gh_invite_house_member(text, text, text);
drop function if exists public.gh_accept_house_invite(uuid);
drop function if exists public.gh_decline_house_invite(uuid);
drop function if exists public.gh_cancel_house_invite(text, uuid);
drop function if exists public.gh_update_house_member_role(text, uuid, text);
drop function if exists public.gh_remove_house_member(text, uuid);
drop function if exists public.gh_house_add_contribution(text, jsonb);

create or replace function public.gh_house_upsert_snapshot(
  p_house_id text,
  p_house jsonb,
  p_people jsonb default '[]'::jsonb,
  p_contributions jsonb default '[]'::jsonb,
  p_ownership_splits jsonb default '[]'::jsonb
)
returns table(house_id text, role text)
language plpgsql
security definer
set search_path = public
as $
declare
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if p_house_id is null or length(trim(p_house_id)) = 0 then
    raise exception 'Missing house id';
  end if;

  actor_role := public.gh_user_house_role(p_house_id, auth.uid());

  if actor_role is null and not exists (select 1 from public.gh_houses h where h.id = p_house_id) then
    insert into public.gh_houses (id, house_data, created_by, archived)
    values (p_house_id, coalesce(p_house, '{}'::jsonb), auth.uid(), coalesce((p_house->>'archived')::boolean, false));

    insert into public.gh_house_members (house_id, user_id, role, status)
    values (p_house_id, auth.uid(), 'owner', 'active');
    actor_role := 'owner';
  elsif actor_role = 'owner' then
    update public.gh_houses
    set house_data = coalesce(p_house, '{}'::jsonb),
        archived = coalesce((p_house->>'archived')::boolean, false),
        updated_at = now()
    where id = p_house_id;
  else
    raise exception 'Not authorised';
  end if;

  delete from public.gh_house_people where house_id = p_house_id;
  insert into public.gh_house_people (id, house_id, person_data, created_at, updated_at)
  select coalesce(item->>'id', gen_random_uuid()::text), p_house_id, item, now(), now()
  from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) item;

  delete from public.gh_house_contributions where house_id = p_house_id;
  insert into public.gh_house_contributions (id, house_id, contribution_data, created_by, created_at, updated_at)
  select coalesce(item->>'id', gen_random_uuid()::text), p_house_id, item, auth.uid(), now(), now()
  from jsonb_array_elements(coalesce(p_contributions, '[]'::jsonb)) item;

  delete from public.gh_house_ownership_splits where house_id = p_house_id;
  insert into public.gh_house_ownership_splits (id, house_id, split_data, created_at, updated_at)
  select coalesce(item->>'id', gen_random_uuid()::text), p_house_id, item, now(), now()
  from jsonb_array_elements(coalesce(p_ownership_splits, '[]'::jsonb)) item;

  return query select p_house_id, actor_role;
end;
$;

create or replace function public.gh_house_list_accessible()
returns table(
  house_id text,
  role text,
  house jsonb,
  people jsonb,
  contributions jsonb,
  ownership_splits jsonb,
  members jsonb,
  invites jsonb
)
language plpgsql
security definer
set search_path = public
as $
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  return query
    select
      h.id,
      coalesce(m.role, 'invited'::text),
      h.house_data,
      coalesce((select jsonb_agg(p.person_data order by p.created_at) from public.gh_house_people p where p.house_id = h.id), '[]'::jsonb),
      coalesce((select jsonb_agg(c.contribution_data order by c.created_at) from public.gh_house_contributions c where c.house_id = h.id), '[]'::jsonb),
      coalesce((select jsonb_agg(s.split_data order by s.created_at) from public.gh_house_ownership_splits s where s.house_id = h.id), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('userId', hm.user_id, 'role', hm.role, 'status', hm.status, 'email', p.email, 'username', p.username) order by hm.created_at) from public.gh_house_members hm left join public.profiles p on p.id = hm.user_id where hm.house_id = h.id and hm.status = 'active'), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'invitedEmail', i.invited_email, 'invitedUserId', i.invited_user_id, 'role', i.role, 'status', i.status, 'createdAt', i.created_at) order by i.created_at desc) from public.gh_house_invites i where i.house_id = h.id and (m.role = 'owner' or i.invited_user_id = auth.uid() or lower(i.invited_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), '')))), '[]'::jsonb)
    from public.gh_houses h
    left join public.gh_house_members m on m.house_id = h.id and m.user_id = auth.uid() and m.status = 'active'
    where m.user_id is not null
       or exists (
         select 1
         from public.gh_house_invites pending
         where pending.house_id = h.id
           and pending.status = 'pending'
           and (
             pending.invited_user_id = auth.uid()
             or lower(pending.invited_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), ''))
           )
       );
end;
$;

create or replace function public.gh_house_add_contribution(p_house_id text, p_contribution jsonb)
returns table(contribution jsonb)
language plpgsql
security definer
set search_path = public
as $
declare
  actor_role text;
  contribution_id text;
  contribution_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  actor_role := public.gh_user_house_role(p_house_id, auth.uid());
  if actor_role not in ('owner', 'editor') then
    raise exception 'Not authorised';
  end if;

  contribution_id := coalesce(nullif(p_contribution->>'id', ''), gen_random_uuid()::text);
  contribution_payload := coalesce(p_contribution, '{}'::jsonb)
    || jsonb_build_object(
      'id', contribution_id,
      'houseId', p_house_id,
      'sourceType', case when p_contribution->>'sourceType' = 'manualAdjustment' then 'manualAdjustment' else 'external' end,
      'linkedTransactionId', null,
      'createdBy', auth.uid(),
      'updatedAt', now()::text
    );

  insert into public.gh_house_contributions (id, house_id, contribution_data, created_by, created_at, updated_at)
  values (contribution_id, p_house_id, contribution_payload, auth.uid(), now(), now())
  on conflict (id) do update
    set contribution_data = excluded.contribution_data,
        updated_at = now()
    where public.gh_house_contributions.house_id = p_house_id;

  return query select contribution_payload;
end;
$;

create or replace function public.gh_invite_house_member(p_house_id text, p_identifier text, p_role text)
returns table(invite_id uuid, invited_user_id uuid, invited_email text, role text, status text)
language plpgsql
security definer
set search_path = public
as $
declare
  invite_email text;
  target_user_id uuid;
  created_invite_id uuid;
  created_invited_user_id uuid;
  created_invited_email text;
  created_role text;
  created_status text;
begin
  if public.gh_user_house_role(p_house_id, auth.uid()) <> 'owner' then
    raise exception 'Not authorised';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'Invalid role';
  end if;

  select p.id, p.email into target_user_id, invite_email
  from public.profiles p
  where lower(p.email) = lower(trim(p_identifier))
     or p.username_normalized = lower(regexp_replace(trim(p_identifier), '\s+', '', 'g'))
  limit 1;

  invite_email := coalesce(invite_email, lower(trim(p_identifier)));
  if invite_email is null or invite_email = '' then
    raise exception 'Enter an email or username';
  end if;

  if target_user_id is not null then
    insert into public.gh_house_members (house_id, user_id, role, status)
    values (p_house_id, target_user_id, p_role, 'active')
    on conflict (house_id, user_id) do update
      set role = excluded.role, status = 'active', updated_at = now();
  end if;

  insert into public.gh_house_invites (house_id, invited_email, invited_user_id, invited_by, role, status)
  values (p_house_id, invite_email, target_user_id, auth.uid(), p_role, case when target_user_id is null then 'pending' else 'accepted' end)
  returning id, gh_house_invites.invited_user_id, gh_house_invites.invited_email, gh_house_invites.role, gh_house_invites.status
  into created_invite_id, created_invited_user_id, created_invited_email, created_role, created_status;

  return query select created_invite_id, created_invited_user_id, created_invited_email, created_role, created_status;
end;
$;

create or replace function public.gh_accept_house_invite(p_invite_id uuid)
returns table(house_id text, role text, status text)
language plpgsql
security definer
set search_path = public
as $
declare
  invite_row public.gh_house_invites%rowtype;
  user_email text;
begin
  if auth.uid() is null then raise exception 'Not authorised'; end if;
  select email into user_email from public.profiles where id = auth.uid();
  select * into invite_row from public.gh_house_invites where id = p_invite_id and status = 'pending';
  if invite_row.id is null or (invite_row.invited_user_id is not null and invite_row.invited_user_id <> auth.uid()) or (invite_row.invited_user_id is null and lower(invite_row.invited_email) <> lower(coalesce(user_email, ''))) then
    raise exception 'Not authorised';
  end if;
  insert into public.gh_house_members (house_id, user_id, role, status)
  values (invite_row.house_id, auth.uid(), invite_row.role, 'active')
  on conflict (house_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  update public.gh_house_invites set invited_user_id = auth.uid(), status = 'accepted', updated_at = now() where id = p_invite_id;
  return query select invite_row.house_id, invite_row.role, 'accepted'::text;
end;
$;

create or replace function public.gh_decline_house_invite(p_invite_id uuid)
returns table(invite_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $
declare
  updated_invite_id uuid;
  updated_status text;
begin
  if auth.uid() is null then raise exception 'Not authorised'; end if;
  update public.gh_house_invites i
  set status = 'declined', updated_at = now()
  where i.id = p_invite_id
    and i.status = 'pending'
    and (i.invited_user_id = auth.uid() or lower(i.invited_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), '')))
  returning i.id, i.status into updated_invite_id, updated_status;
  if updated_invite_id is null then raise exception 'Not authorised'; end if;
  return query select updated_invite_id, updated_status;
end;
$;

create or replace function public.gh_cancel_house_invite(p_house_id text, p_invite_id uuid)
returns table(invite_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $
declare
  updated_invite_id uuid;
  updated_status text;
begin
  if public.gh_user_house_role(p_house_id, auth.uid()) <> 'owner' then raise exception 'Not authorised'; end if;
  update public.gh_house_invites i set status = 'cancelled', updated_at = now()
  where i.id = p_invite_id and i.house_id = p_house_id and i.status = 'pending'
  returning i.id, i.status into updated_invite_id, updated_status;
  return query select updated_invite_id, updated_status;
end;
$;

create or replace function public.gh_update_house_member_role(p_house_id text, p_user_id uuid, p_role text)
returns table(user_id uuid, role text, status text)
language plpgsql
security definer
set search_path = public
as $
declare
  updated_user_id uuid;
  updated_role text;
  updated_status text;
begin
  if public.gh_user_house_role(p_house_id, auth.uid()) <> 'owner' then raise exception 'Not authorised'; end if;
  if p_role not in ('owner', 'editor', 'viewer') then raise exception 'Invalid role'; end if;
  if p_user_id = auth.uid() and p_role <> 'owner' and (select count(*) from public.gh_house_members where house_id = p_house_id and role = 'owner' and status = 'active') <= 1 then
    raise exception 'Cannot remove the last owner';
  end if;
  update public.gh_house_members m set role = p_role, updated_at = now()
  where m.house_id = p_house_id and m.user_id = p_user_id and m.status = 'active'
  returning m.user_id, m.role, m.status into updated_user_id, updated_role, updated_status;
  if updated_user_id is null then raise exception 'Member not found'; end if;
  return query select updated_user_id, updated_role, updated_status;
end;
$;

create or replace function public.gh_remove_house_member(p_house_id text, p_user_id uuid)
returns table(user_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $
declare
  updated_user_id uuid;
  updated_status text;
begin
  if public.gh_user_house_role(p_house_id, auth.uid()) <> 'owner' then raise exception 'Not authorised'; end if;
  if (select role from public.gh_house_members where house_id = p_house_id and user_id = p_user_id and status = 'active') = 'owner'
     and (select count(*) from public.gh_house_members where house_id = p_house_id and role = 'owner' and status = 'active') <= 1 then
    raise exception 'Cannot remove the last owner';
  end if;
  update public.gh_house_members m set status = 'removed', updated_at = now()
  where m.house_id = p_house_id and m.user_id = p_user_id and m.status = 'active'
  returning m.user_id, m.status into updated_user_id, updated_status;
  if updated_user_id is null then raise exception 'Member not found'; end if;
  return query select updated_user_id, updated_status;
end;
$;

revoke all on function public.gh_user_house_role(text, uuid) from public;
revoke all on function public.gh_user_can_access_house(text, uuid) from public;
revoke all on function public.gh_house_upsert_snapshot(text, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.gh_house_list_accessible() from public;
revoke all on function public.gh_invite_house_member(text, text, text) from public;
revoke all on function public.gh_accept_house_invite(uuid) from public;
revoke all on function public.gh_decline_house_invite(uuid) from public;
revoke all on function public.gh_cancel_house_invite(text, uuid) from public;
revoke all on function public.gh_update_house_member_role(text, uuid, text) from public;
revoke all on function public.gh_remove_house_member(text, uuid) from public;
revoke all on function public.gh_house_add_contribution(text, jsonb) from public;

grant execute on function public.gh_user_house_role(text, uuid) to authenticated;
grant execute on function public.gh_user_can_access_house(text, uuid) to authenticated;
grant execute on function public.gh_house_upsert_snapshot(text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.gh_house_list_accessible() to authenticated;
grant execute on function public.gh_invite_house_member(text, text, text) to authenticated;
grant execute on function public.gh_accept_house_invite(uuid) to authenticated;
grant execute on function public.gh_decline_house_invite(uuid) to authenticated;
grant execute on function public.gh_cancel_house_invite(text, uuid) to authenticated;
grant execute on function public.gh_update_house_member_role(text, uuid, text) to authenticated;
grant execute on function public.gh_remove_house_member(text, uuid) to authenticated;
grant execute on function public.gh_house_add_contribution(text, jsonb) to authenticated;