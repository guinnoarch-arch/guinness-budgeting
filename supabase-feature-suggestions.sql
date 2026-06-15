-- Guinness Budgeting feature suggestions setup
-- Safe to rerun after the main Supabase admin setup.

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
returns table(id uuid, status text, created_at timestamptz)
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
  if auth.uid() is null then raise exception 'Not authorised'; end if;
  if length(trim(coalesce(p_message, ''))) = 0 then raise exception 'Enter a suggestion first'; end if;

  select p.email, p.username into profile_email, profile_username
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
  if auth.uid() is null then raise exception 'Not authorised'; end if;

  return query
    select
      s.id, s.message, s.status, s.admin_note, s.submitted_username,
      case when s.submitted_by = auth.uid() then s.submitted_email else null end,
      s.created_at, s.updated_at,
      coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::integer,
      coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::integer,
      coalesce((select mv.vote::integer from public.gh_feature_suggestion_votes mv where mv.suggestion_id = s.id and mv.user_id = auth.uid()), 0)
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
  if auth.uid() is null then raise exception 'Not authorised'; end if;
  if p_vote not in (-1, 1) then raise exception 'Invalid vote'; end if;
  if not exists (select 1 from public.gh_feature_suggestions s where s.id = p_suggestion_id) then raise exception 'Suggestion not found'; end if;

  insert into public.gh_feature_suggestion_votes (suggestion_id, user_id, vote)
  values (p_suggestion_id, auth.uid(), p_vote)
  on conflict (suggestion_id, user_id) do update set vote = excluded.vote, updated_at = now();

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
  if auth.uid() is null then raise exception 'Not authorised'; end if;
  if not public.gh_is_admin(auth.uid()) then raise exception 'Not authorised'; end if;

  return query
    select s.id, s.message, s.status, s.admin_note, s.submitted_by, s.submitted_email, s.submitted_username, s.created_at, s.updated_at, s.reviewed_at,
      coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::integer,
      coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::integer
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
  if auth.uid() is null then raise exception 'Not authorised'; end if;
  if not public.gh_is_admin(auth.uid()) then raise exception 'Not authorised'; end if;
  if p_status not in ('new', 'reviewed', 'planned', 'in_progress', 'done', 'rejected') then raise exception 'Invalid suggestion status'; end if;

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
    select s.id, s.message, s.status, s.admin_note, s.submitted_by, s.submitted_email, s.submitted_username, s.created_at, s.updated_at, s.reviewed_at,
      coalesce(sum(case when v.vote = 1 then 1 else 0 end), 0)::integer,
      coalesce(sum(case when v.vote = -1 then 1 else 0 end), 0)::integer
    from public.gh_feature_suggestions s
    left join public.gh_feature_suggestion_votes v on v.suggestion_id = s.id
    where s.id = p_suggestion_id
    group by s.id;
end;
$$;

revoke all on function public.gh_submit_feature_suggestion(text) from public;
revoke all on function public.gh_list_feature_suggestions(text) from public;
revoke all on function public.gh_vote_feature_suggestion(uuid, smallint) from public;
revoke all on function public.gh_admin_list_feature_suggestions(text) from public;
revoke all on function public.gh_admin_update_feature_suggestion(uuid, text, text) from public;
grant execute on function public.gh_submit_feature_suggestion(text) to authenticated;
grant execute on function public.gh_list_feature_suggestions(text) to authenticated;
grant execute on function public.gh_vote_feature_suggestion(uuid, smallint) to authenticated;
grant execute on function public.gh_admin_list_feature_suggestions(text) to authenticated;
grant execute on function public.gh_admin_update_feature_suggestion(uuid, text, text) to authenticated;
