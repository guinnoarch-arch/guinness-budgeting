import { APP_VERSION, BACKUP_FORMAT_VERSION, DATA_SCHEMA_VERSION, createBackupPayload, getBackupCounts } from "./storageService.js";
import {
  getDefaultSupabaseConfigFromEnv,
  getSupabaseKeySafetyIssue as getSupabaseKeySafetyIssueFromClient,
  isValidSupabaseProjectUrl,
  isSupabasePublishableKey,
  readSupabaseResponse,
  trimSupabaseUrl
} from "./supabaseClient.js";
import houseSharingSetupSql from "../../supabase-house-sharing.sql?raw";

const CLOUD_SESSION_KEY = "gh-budgeting-supabase-cloud-session-v1";
const CLOUD_BACKUP_TABLE = "gh_cloud_backups";
const DEFAULT_APP_SESSION_DAYS = 7;

function isBrowser() {
  return typeof window !== "undefined";
}

export function getSupabaseKeySafetyIssue(value) {
  return getSupabaseKeySafetyIssueFromClient(value);
}

export function normaliseCloudBackupSettings(settings = {}) {
  const current = settings.cloudBackup && typeof settings.cloudBackup === "object" && !Array.isArray(settings.cloudBackup)
    ? settings.cloudBackup
    : {};
  const envDefaults = getDefaultSupabaseConfigFromEnv();

  return {
    provider: current.provider || "supabase",
    mode: current.mode || "auto-cloud-backup",
    enabled: Boolean(current.enabled),
    autoBackupEnabled: current.autoBackupEnabled !== false,
    requireLoginBeforeData: current.requireLoginBeforeData !== false,
    supabaseUrl: String(envDefaults.supabaseUrl || "").trim(),
    supabaseAnonKey: String(envDefaults.supabaseAnonKey || "").trim(),
    cloudUserId: current.cloudUserId || null,
    cloudUserEmail: current.cloudUserEmail || "",
    lastSignedInAt: current.lastSignedInAt || null,
    lastCloudBackupAt: current.lastCloudBackupAt || null,
    lastCloudBackupId: current.lastCloudBackupId || null,
    lastCloudRestoreAt: current.lastCloudRestoreAt || null,
    lastCloudListAt: current.lastCloudListAt || null,
    lastCloudError: current.lastCloudError || null,
    cloudBackupNeeded: Boolean(current.cloudBackupNeeded),
    linkedLocalDataAt: current.linkedLocalDataAt || null,
    lastAutoCloudBackupAt: current.lastAutoCloudBackupAt || null,
    lastCloudConflictAt: current.lastCloudConflictAt || null,
    cloudConflict: current.cloudConflict || null,
    appSessionDays: Number(current.appSessionDays || DEFAULT_APP_SESSION_DAYS),
    tableName: current.tableName || CLOUD_BACKUP_TABLE,
    version: current.version || "1"
  };
}

export function getCloudConfig(settings = {}) {
  const cloud = normaliseCloudBackupSettings(settings);
  return {
    url: trimSupabaseUrl(cloud.supabaseUrl),
    anonKey: cloud.supabaseAnonKey,
    tableName: cloud.tableName || CLOUD_BACKUP_TABLE
  };
}

export function isCloudBackupConfigured(settings = {}) {
  const { url, anonKey } = getCloudConfig(settings);
  return Boolean(url && anonKey && isValidSupabaseProjectUrl(url) && !getSupabaseKeySafetyIssue(anonKey));
}

export function isCloudLoginGateRequired(settings = {}) {
  normaliseCloudBackupSettings(settings);
  return true;
}

export function isCloudSessionAllowed(settings = {}, summary = getStoredCloudSessionSummary()) {
  const cloud = normaliseCloudBackupSettings(settings);
  if (!summary?.signedIn || summary.isExpired) return false;
  if (cloud.cloudUserId && summary.user?.id && cloud.cloudUserId !== summary.user.id) return false;
  return true;
}

function getCloudConfigOrThrow(settings = {}) {
  const config = getCloudConfig(settings);
  if (!config.url || !config.anonKey) {
    throw new Error("Cloud login is not configured for this build.");
  }
  if (!isValidSupabaseProjectUrl(config.url)) {
    throw new Error("Cloud login configuration is invalid for this build.");
  }
  const keySafetyIssue = getSupabaseKeySafetyIssue(config.anonKey);
  if (keySafetyIssue) {
    throw new Error(keySafetyIssue);
  }
  return config;
}

async function readApiResponse(response) {
  return readSupabaseResponse(response);
}

function getAuthHeaders(config, session = null) {
  const headers = { apikey: config.anonKey };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  } else if (!isSupabasePublishableKey(config.anonKey)) {
    // Legacy Supabase anon JWT keys can be used as the bearer token for anon
    // PostgREST calls. New sb_publishable_ keys are API keys, not JWT bearer
    // tokens, so do not put them in the Authorization header.
    headers.Authorization = `Bearer ${config.anonKey}`;
  }

  return headers;
}

async function fetchSupabaseEndpoint(url, options = {}, context = "Supabase request") {
  try {
    return await fetch(url, options);
  } catch (error) {
    const message = error?.message || "Failed to fetch";
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      throw new Error(`${context} could not reach Supabase. Check your internet connection and make sure the app is using the correct Supabase project URL.`);
    }
    throw error;
  }
}

export function loadStoredCloudSession() {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(CLOUD_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredCloudSessionSummary(settings = {}) {
  const session = loadStoredCloudSession();
  if (!session) return { signedIn: false, user: null, expiresAt: null, isExpired: false };
  const cloud = normaliseCloudBackupSettings(settings);
  const expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : null;
  const appLoginAt = session.app_login_at || session.user?.last_sign_in_at || null;
  const appLoginTime = appLoginAt ? new Date(appLoginAt).getTime() : null;
  const appExpiresAt = appLoginTime && Number.isFinite(appLoginTime)
    ? appLoginTime + Math.max(1, Number(cloud.appSessionDays || DEFAULT_APP_SESSION_DAYS)) * 24 * 60 * 60 * 1000
    : null;
  const tokenExpired = expiresAt ? expiresAt <= Date.now() + 30000 : false;
  const appExpired = appExpiresAt ? appExpiresAt <= Date.now() : false;
  return {
    signedIn: true,
    user: session.user || null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    appLoginAt,
    appExpiresAt: appExpiresAt ? new Date(appExpiresAt).toISOString() : null,
    tokenExpired,
    appExpired,
    isExpired: tokenExpired || appExpired
  };
}

function storeCloudSession(session, options = {}) {
  if (!isBrowser()) return session;
  const existing = loadStoredCloudSession();
  const stored = {
    ...session,
    app_login_at: options.resetAppLogin || !existing?.app_login_at ? new Date().toISOString() : existing.app_login_at
  };
  window.localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(stored));
  return stored;
}

export function clearStoredCloudSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(CLOUD_SESSION_KEY);
}

function normaliseAuthSession(responseBody) {
  const user = responseBody.user || responseBody?.data?.user || null;
  if (!responseBody.access_token || !user?.id) {
    throw new Error("Supabase did not return a usable session. Check email confirmation/login settings.");
  }
  return {
    access_token: responseBody.access_token,
    refresh_token: responseBody.refresh_token || null,
    token_type: responseBody.token_type || "bearer",
    expires_in: responseBody.expires_in || null,
    expires_at: responseBody.expires_at || Math.floor(Date.now() / 1000) + Number(responseBody.expires_in || 3600),
    user
  };
}

export async function signInToSupabaseCloud(settings, email, password) {
  const config = getCloudConfigOrThrow(settings);
  const response = await fetchSupabaseEndpoint(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: String(email || "").trim(), password })
  }, "Sign in");

  const body = await readApiResponse(response);
  return storeCloudSession(normaliseAuthSession(body), { resetAppLogin: true });
}

export async function signUpToSupabaseCloud(settings, email, password, metadata = {}) {
  const config = getCloudConfigOrThrow(settings);
  const response = await fetchSupabaseEndpoint(`${config.url}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: String(email || "").trim(), password, data: metadata })
  }, "Create account");

  const body = await readApiResponse(response);

  if (body.access_token) {
    return storeCloudSession(normaliseAuthSession(body), { resetAppLogin: true });
  }

  return {
    pendingEmailConfirmation: true,
    user: body.user || null
  };
}

export async function refreshSupabaseCloudSession(settings) {
  const config = getCloudConfigOrThrow(settings);
  const existing = loadStoredCloudSession();
  if (!existing?.refresh_token) {
    throw new Error("No refresh token is saved. Sign in again.");
  }

  const response = await fetchSupabaseEndpoint(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: existing.refresh_token })
  }, "Refresh session");

  const body = await readApiResponse(response);
  return storeCloudSession(normaliseAuthSession(body), { resetAppLogin: false });
}

export async function resolveSupabaseUsernameLogin(settings, usernameNormalized) {
  const config = getCloudConfigOrThrow(settings);
  const username = String(usernameNormalized || "").trim().toLowerCase();
  if (!username) throw new Error("Enter your email address or username.");

  const response = await fetchSupabaseEndpoint(`${config.url}/rest/v1/rpc/gh_resolve_username_login`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username_input: username })
  }, "Username lookup");

  const body = await readApiResponse(response);
  const row = Array.isArray(body) ? body[0] : body;
  return row?.email || null;
}

export async function upsertSupabaseProfile(settings, { id, email, username }) {
  const config = getCloudConfigOrThrow(settings);
  const session = await getValidCloudSession(settings);
  const userId = id || session.user?.id;
  const profileEmail = String(email || session.user?.email || "").trim().toLowerCase();
  const profileUsername = String(username || session.user?.user_metadata?.username || profileEmail.split("@")[0] || "").trim();
  const usernameNormalised = profileUsername.toLowerCase();
  if (!userId || !profileEmail || !profileUsername) {
    throw new Error("Cannot create profile without user id, email and username.");
  }

  const rows = await supabaseRestFetch(settings, "profiles?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      id: userId,
      email: profileEmail,
      username: profileUsername,
      username_normalized: usernameNormalised,
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString()
    })
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function getValidCloudSession(settings) {
  const summary = getStoredCloudSessionSummary(settings);
  if (!summary.signedIn) throw new Error("Sign in to Supabase cloud backup first.");
  if (summary.appExpired) throw new Error("The app session expired. Sign in again to unlock your budget.");
  if (summary.tokenExpired) return refreshSupabaseCloudSession(settings);
  return loadStoredCloudSession();
}

export async function supabaseRestFetch(settings, path, options = {}) {
  const config = getCloudConfigOrThrow(settings);
  const session = await getValidCloudSession(settings);
  const response = await fetchSupabaseEndpoint(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(config, session),
      ...(options.headers || {})
    }
  }, "Cloud backup request");
  return readApiResponse(response);
}

export async function listSupabaseCloudBackups(settings, limit = 10) {
  const config = getCloudConfigOrThrow(settings);
  const path = `${config.tableName}?select=id,created_at,updated_at,backup_label,app_version,data_schema_version,backup_format_version,counts,client_generated_at,source&order=created_at.desc&limit=${Number(limit) || 10}`;
  const rows = await supabaseRestFetch(settings, path, { method: "GET" });
  return Array.isArray(rows) ? rows : [];
}

export async function uploadSupabaseCloudBackup(settings, appData, options = {}) {
  const config = getCloudConfigOrThrow(settings);
  const session = await getValidCloudSession(settings);
  const exportedAt = options.exportedAt || new Date().toISOString();
  const backupType = options.backupType || "manual";
  const payload = createBackupPayload(appData, exportedAt);
  payload.source = "supabase-cloud-backup";
  payload.cloudBackup = {
    backupId: options.backupId || globalThis.crypto?.randomUUID?.() || `cloud-${Date.now()}`,
    userId: session.user.id,
    appDataVersion: DATA_SCHEMA_VERSION,
    createdAt: exportedAt,
    updatedAt: exportedAt,
    sourceAppVersion: APP_VERSION,
    backupType,
    data: "Full app backup is stored in this JSON object."
  };
  payload.receiptStorage = {
    storageType: "indexedDB",
    skipped: true,
    reason: "Cloud backup stores app records only. Receipt/file cloud backup is intentionally disabled in V2.6 to protect the free quota."
  };
  payload.counts.indexedDbReceipts = 0;

  const row = {
    user_id: session.user.id,
    profile_id: appData.activeProfileId || appData.profile?.localProfileId || null,
    backup_label: options.label || `Manual cloud backup ${new Date(exportedAt).toLocaleString("en-GB")}`,
    backup_format_version: BACKUP_FORMAT_VERSION,
    app_version: APP_VERSION,
    data_schema_version: DATA_SCHEMA_VERSION,
    counts: getBackupCounts(appData),
    backup_json: payload,
    client_generated_at: exportedAt,
    source: `${backupType}-cloud-backup`
  };

  const inserted = await supabaseRestFetch(settings, config.tableName, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(row)
  });

  return Array.isArray(inserted) ? inserted[0] : inserted;
}

export async function fetchLatestSupabaseCloudBackup(settings) {
  const config = getCloudConfigOrThrow(settings);
  const rows = await supabaseRestFetch(
    settings,
    `${config.tableName}?select=id,created_at,updated_at,backup_label,backup_json,counts,app_version,data_schema_version,backup_format_version,client_generated_at,source&order=created_at.desc&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function fetchSupabaseCloudBackup(settings, backupId) {
  const config = getCloudConfigOrThrow(settings);
  const safeId = encodeURIComponent(String(backupId || ""));
  if (!safeId) throw new Error("No cloud backup selected.");

  const rows = await supabaseRestFetch(
    settings,
    `${config.tableName}?id=eq.${safeId}&select=id,created_at,backup_label,backup_json,counts,app_version,data_schema_version,backup_format_version,client_generated_at&limit=1`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Cloud backup not found, or this user is not allowed to read it.");
  }

  return rows[0];
}

export async function deleteSupabaseCloudBackup(settings, backupId) {
  const config = getCloudConfigOrThrow(settings);
  const safeId = encodeURIComponent(String(backupId || ""));
  if (!safeId) throw new Error("No cloud backup selected.");

  await supabaseRestFetch(settings, `${config.tableName}?id=eq.${safeId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  return true;
}

export async function downloadCloudBackupJson(row) {
  if (!isBrowser()) return { ok: false, reason: "Not running in a browser." };
  const backupJson = row?.backup_json;
  if (!backupJson) throw new Error("Selected cloud backup has no backup JSON payload.");
  const createdAt = row.client_generated_at || row.created_at || new Date().toISOString();
  const safeDate = String(createdAt).slice(0, 10) || "backup";
  const filename = `Guinness-Holley-Cloud-Backup-${safeDate}.json`;
  const blob = new Blob([JSON.stringify(backupJson, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { ok: true, filename };
}

export function getSupabaseSetupSql() {
  return `-- GH Budgeting auth profile + cloud backup setup
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
  add column if not exists paused boolean not null default false;

alter table public.profiles
  add column if not exists paused_at timestamptz;

alter table public.profiles
  add column if not exists paused_by uuid references auth.users(id) on delete set null;

alter table public.profiles
  add column if not exists last_activity_at timestamptz;

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

update public.profiles
set role = coalesce(nullif(role, ''), 'user'),
    blocked = coalesce(blocked, false),
    paused = coalesce(paused, false),
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

alter table public.gh_admin_settings
  add column if not exists maintenance_mode boolean not null default false;

alter table public.gh_admin_settings
  add column if not exists maintenance_message text;

insert into public.gh_admin_settings (id, admin_claim_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.gh_admin_settings enable row level security;

create table if not exists public.gh_broadcast_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'urgent')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

alter table public.gh_broadcast_messages enable row level security;
revoke all on public.gh_broadcast_messages from anon, authenticated;

create index if not exists gh_broadcast_messages_active_idx
  on public.gh_broadcast_messages (active, created_at desc);

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

-- Paused is a separate, reversible-by-design status distinct from blocked
-- (different admin action, different user-facing message), but it must deny
-- data access exactly like blocked does. gh_is_denied_access is the single
-- check every access-controlling RLS policy calls, so a paused user is
-- locked out at the database layer the same way a blocked user is, without
-- duplicating that logic across every policy.
create or replace function public.gh_is_paused(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = user_id
      and p.paused = true
  );
$$;

create or replace function public.gh_is_denied_access(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.gh_is_blocked(user_id), false) or coalesce(public.gh_is_paused(user_id), false);
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
drop function if exists public.gh_admin_set_user_paused(uuid, boolean);
drop function if exists public.gh_get_admin_access_state();
drop function if exists public.gh_get_app_notices();
drop function if exists public.gh_admin_set_app_status(boolean, text);
drop function if exists public.gh_admin_send_broadcast(text, text);
drop function if exists public.gh_admin_clear_broadcast();

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
  is_blocked boolean,
  is_paused boolean
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
    coalesce(p.blocked, false) as is_blocked,
    coalesce(p.paused, false) as is_paused
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
  is_blocked boolean,
  is_paused boolean
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
  is_blocked boolean,
  is_paused boolean
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
  paused boolean,
  paused_at timestamptz,
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
      coalesce(p.paused, false) as paused,
      p.paused_at,
      p.created_at,
      p.updated_at,
      coalesce(p.last_activity_at, max(b.created_at), p.updated_at, p.created_at) as last_activity_at,
      p.role = 'admin' as is_admin
    from public.profiles p
    left join public.gh_cloud_backups b on b.user_id = p.id
    group by p.id, p.username, p.email, p.role, p.blocked, p.paused, p.paused_at, p.created_at, p.updated_at, p.last_activity_at
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

-- Pause is deliberately a separate admin action from block, not an alias for
-- it: same access-denial effect (enforced via gh_is_denied_access), but a
-- distinct status/timestamp/actor and distinct user-facing message, so an
-- admin can temporarily suspend an account without it reading as punitive.
create or replace function public.gh_admin_set_user_paused(target_user_id uuid, target_paused boolean)
returns table(
  id uuid,
  username text,
  email text,
  role text,
  is_admin boolean,
  paused boolean,
  paused_at timestamptz,
  paused_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_role text;
  target_current_paused boolean;
  active_admin_count integer;
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

  select p.role, coalesce(p.paused, false)
    into target_profile_role, target_current_paused
  from public.profiles p
  where p.id = target_user_id;

  if target_profile_role is null then
    raise exception 'User not found';
  end if;

  select count(*)::integer into active_admin_count
  from public.profiles
  where profiles.role = 'admin'
    and coalesce(profiles.blocked, false) = false
    and coalesce(profiles.paused, false) = false;

  if target_profile_role = 'admin' and coalesce(target_paused, false) = true and active_admin_count <= 1 then
    raise exception 'Cannot pause the last active admin.';
  end if;

  update public.profiles p
  set paused = coalesce(target_paused, false),
      paused_at = case when coalesce(target_paused, false) then now() else null end,
      paused_by = case when coalesce(target_paused, false) then auth.uid() else null end,
      updated_at = now()
  where p.id = target_user_id;

  perform public.gh_log_admin_action(
    case when coalesce(target_paused, false) then 'user_paused' else 'user_unpaused' end,
    jsonb_build_object('target_user_id', target_user_id, 'previous_paused', target_current_paused, 'paused', coalesce(target_paused, false))
  );

  return query
    select p.id, p.username, p.email, p.role, p.role = 'admin', p.paused, p.paused_at, p.paused_by, p.created_at, p.updated_at
    from public.profiles p
    where p.id = target_user_id;
end;
$$;

-- App-wide status (maintenance mode) and broadcast messages both need to
-- reach every signed-in client, not just the admin's own browser - unlike
-- feature flags, which only ever live in the toggling device's local
-- settings. gh_get_app_notices is one cheap combined read (both admins and
-- ordinary users poll it) so a maintenance notice and a broadcast message
-- share a single round trip instead of two.
create or replace function public.gh_get_app_notices()
returns table(
  maintenance_mode boolean,
  maintenance_message text,
  broadcast_id uuid,
  broadcast_message text,
  broadcast_severity text,
  broadcast_created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(s.maintenance_mode, false),
    s.maintenance_message,
    b.id,
    b.message,
    b.severity,
    b.created_at
  from public.gh_admin_settings s
  left join lateral (
    select gb.id, gb.message, gb.severity, gb.created_at
    from public.gh_broadcast_messages gb
    where gb.active = true
    order by gb.created_at desc
    limit 1
  ) b on true
  where s.id = true;
$$;

create or replace function public.gh_admin_set_app_status(p_maintenance_mode boolean, p_maintenance_message text default null)
returns table(maintenance_mode boolean, maintenance_message text)
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
  set maintenance_mode = coalesce(p_maintenance_mode, false),
      maintenance_message = nullif(trim(coalesce(p_maintenance_message, '')), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where s.id = true;

  perform public.gh_log_admin_action(
    'maintenance_mode_changed',
    jsonb_build_object('maintenance_mode', coalesce(p_maintenance_mode, false), 'maintenance_message', p_maintenance_message)
  );

  return query
    select s.maintenance_mode, s.maintenance_message
    from public.gh_admin_settings s
    where s.id = true;
end;
$$;

create or replace function public.gh_admin_send_broadcast(p_message text, p_severity text default 'info')
returns table(id uuid, message text, severity text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authorised';
  end if;

  if not public.gh_is_admin(auth.uid()) then
    raise exception 'Not authorised';
  end if;

  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'Enter a message first';
  end if;

  if p_severity not in ('info', 'warning', 'urgent') then
    raise exception 'Invalid severity';
  end if;

  select p.email into profile_email from public.profiles p where p.id = auth.uid();

  -- Only one broadcast is ever active at a time - sending a new one retires
  -- the previous one rather than stacking popups.
  update public.gh_broadcast_messages set active = false where active = true;

  perform public.gh_log_admin_action(
    'broadcast_sent',
    jsonb_build_object('message', left(trim(p_message), 200), 'severity', p_severity)
  );

  return query
    insert into public.gh_broadcast_messages (message, severity, created_by, created_by_email, active)
    values (left(trim(p_message), 2000), p_severity, auth.uid(), profile_email, true)
    returning gh_broadcast_messages.id, gh_broadcast_messages.message, gh_broadcast_messages.severity, gh_broadcast_messages.created_at;
end;
$$;

create or replace function public.gh_admin_clear_broadcast()
returns void
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

  update public.gh_broadcast_messages set active = false where active = true;

  perform public.gh_log_admin_action('broadcast_cleared', '{}'::jsonb);
end;
$$;

revoke all on function public.gh_is_paused(uuid) from public;
revoke all on function public.gh_is_denied_access(uuid) from public;
revoke all on function public.gh_admin_set_user_paused(uuid, boolean) from public;
revoke all on function public.gh_get_app_notices() from public;
revoke all on function public.gh_admin_set_app_status(boolean, text) from public;
revoke all on function public.gh_admin_send_broadcast(text, text) from public;
revoke all on function public.gh_admin_clear_broadcast() from public;

grant execute on function public.gh_is_paused(uuid) to authenticated;
grant execute on function public.gh_is_denied_access(uuid) to authenticated;
grant execute on function public.gh_admin_set_user_paused(uuid, boolean) to authenticated;
grant execute on function public.gh_get_app_notices() to authenticated, anon;
grant execute on function public.gh_admin_set_app_status(boolean, text) to authenticated;
grant execute on function public.gh_admin_send_broadcast(text, text) to authenticated;
grant execute on function public.gh_admin_clear_broadcast() to authenticated;

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
  using (auth.uid() = user_id and not public.gh_is_denied_access(auth.uid()));

create policy "GH users can insert own backups"
  on public.gh_cloud_backups for insert
  with check (auth.uid() = user_id and not public.gh_is_denied_access(auth.uid()));

create policy "GH users can update own backups"
  on public.gh_cloud_backups for update
  using (auth.uid() = user_id and not public.gh_is_denied_access(auth.uid()))
  with check (auth.uid() = user_id and not public.gh_is_denied_access(auth.uid()));

create policy "GH users can delete own backups"
  on public.gh_cloud_backups for delete
  using (auth.uid() = user_id and not public.gh_is_denied_access(auth.uid()));

create index if not exists gh_cloud_backups_user_created_idx
  on public.gh_cloud_backups (user_id, created_at desc);

${houseSharingSetupSql}`;
}
