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
as $$
  select m.role
  from public.gh_house_members m
  where m.house_id = p_house_id
    and m.user_id = p_user_id
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.gh_user_can_access_house(p_house_id text, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.gh_user_house_role(p_house_id, p_user_id) is not null;
$$;

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
as $$
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
$$;

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
as $$
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
$$;

create or replace function public.gh_house_add_contribution(p_house_id text, p_contribution jsonb)
returns table(contribution jsonb)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.gh_invite_house_member(p_house_id text, p_identifier text, p_role text)
returns table(invite_id uuid, invited_user_id uuid, invited_email text, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.gh_accept_house_invite(p_invite_id uuid)
returns table(house_id text, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.gh_decline_house_invite(p_invite_id uuid)
returns table(invite_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.gh_cancel_house_invite(p_house_id text, p_invite_id uuid)
returns table(invite_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.gh_update_house_member_role(p_house_id text, p_user_id uuid, p_role text)
returns table(user_id uuid, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.gh_remove_house_member(p_house_id text, p_user_id uuid)
returns table(user_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

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
