import { APP_VERSION, BACKUP_FORMAT_VERSION, DATA_SCHEMA_VERSION, createBackupPayload, getBackupCounts } from "./storageService.js";
import {
  getDefaultSupabaseConfigFromEnv,
  getSupabaseKeySafetyIssue as getSupabaseKeySafetyIssueFromClient,
  isValidSupabaseProjectUrl,
  isSupabasePublishableKey,
  readSupabaseResponse,
  trimSupabaseUrl
} from "./supabaseClient.js";

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
      updated_at: new Date().toISOString()
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

async function supabaseRestFetch(settings, path, options = {}) {
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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text not null,
  username_normalized text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  insert into public.profiles (id, email, username, username_normalized)
  values (new.id, new.email, profile_username, profile_username_normalized);

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
  using (auth.uid() = user_id);

create policy "GH users can insert own backups"
  on public.gh_cloud_backups for insert
  with check (auth.uid() = user_id);

create policy "GH users can update own backups"
  on public.gh_cloud_backups for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "GH users can delete own backups"
  on public.gh_cloud_backups for delete
  using (auth.uid() = user_id);

create index if not exists gh_cloud_backups_user_created_idx
  on public.gh_cloud_backups (user_id, created_at desc);`;
}
