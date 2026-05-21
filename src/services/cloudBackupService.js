import { APP_VERSION, BACKUP_FORMAT_VERSION, DATA_SCHEMA_VERSION, createBackupPayload, getBackupCounts } from "./storageService.js";

const CLOUD_SESSION_KEY = "gh-budgeting-supabase-cloud-session-v1";
const CLOUD_BACKUP_TABLE = "gh_cloud_backups";

function isBrowser() {
  return typeof window !== "undefined";
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function normaliseCloudBackupSettings(settings = {}) {
  const current = settings.cloudBackup && typeof settings.cloudBackup === "object" && !Array.isArray(settings.cloudBackup)
    ? settings.cloudBackup
    : {};

  return {
    provider: current.provider || "supabase",
    mode: current.mode || "manual-cloud-backup",
    enabled: Boolean(current.enabled),
    requireLoginBeforeData: current.requireLoginBeforeData !== false,
    supabaseUrl: String(current.supabaseUrl || "").trim(),
    supabaseAnonKey: String(current.supabaseAnonKey || "").trim(),
    cloudUserId: current.cloudUserId || null,
    cloudUserEmail: current.cloudUserEmail || "",
    lastSignedInAt: current.lastSignedInAt || null,
    lastCloudBackupAt: current.lastCloudBackupAt || null,
    lastCloudBackupId: current.lastCloudBackupId || null,
    lastCloudRestoreAt: current.lastCloudRestoreAt || null,
    lastCloudListAt: current.lastCloudListAt || null,
    lastCloudError: current.lastCloudError || null,
    tableName: current.tableName || CLOUD_BACKUP_TABLE,
    version: current.version || "1"
  };
}

export function getCloudConfig(settings = {}) {
  const cloud = normaliseCloudBackupSettings(settings);
  return {
    url: trimTrailingSlash(cloud.supabaseUrl),
    anonKey: cloud.supabaseAnonKey,
    tableName: cloud.tableName || CLOUD_BACKUP_TABLE
  };
}

export function isCloudBackupConfigured(settings = {}) {
  const { url, anonKey } = getCloudConfig(settings);
  return Boolean(url && anonKey && /^https:\/\/.+\.supabase\.co$/i.test(url));
}

export function isCloudLoginGateRequired(settings = {}) {
  return normaliseCloudBackupSettings(settings).requireLoginBeforeData !== false;
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
    throw new Error("Enter your Supabase project URL and anon key first.");
  }
  if (!/^https:\/\/.+\.supabase\.co$/i.test(config.url)) {
    throw new Error("Supabase URL should look like https://your-project.supabase.co");
  }
  return config;
}

function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readApiResponse(response) {
  const text = await response.text();
  const parsed = parseJsonSafely(text);

  if (!response.ok) {
    const message = parsed?.msg || parsed?.message || parsed?.error_description || parsed?.hint || parsed?.details || text || `Supabase request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return parsed;
}

function getAuthHeaders(config, session = null) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${session?.access_token || config.anonKey}`
  };
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

export function getStoredCloudSessionSummary() {
  const session = loadStoredCloudSession();
  if (!session) return { signedIn: false, user: null, expiresAt: null, isExpired: false };
  const expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : null;
  return {
    signedIn: true,
    user: session.user || null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    isExpired: expiresAt ? expiresAt <= Date.now() + 30000 : false
  };
}

function storeCloudSession(session) {
  if (!isBrowser()) return session;
  window.localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
  return session;
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
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: String(email || "").trim(), password })
  });

  const body = await readApiResponse(response);
  return storeCloudSession(normaliseAuthSession(body));
}

export async function signUpToSupabaseCloud(settings, email, password) {
  const config = getCloudConfigOrThrow(settings);
  const response = await fetch(`${config.url}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: String(email || "").trim(), password })
  });

  const body = await readApiResponse(response);

  if (body.access_token) {
    return storeCloudSession(normaliseAuthSession(body));
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

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: existing.refresh_token })
  });

  const body = await readApiResponse(response);
  return storeCloudSession(normaliseAuthSession(body));
}

async function getValidCloudSession(settings) {
  const summary = getStoredCloudSessionSummary();
  if (!summary.signedIn) throw new Error("Sign in to Supabase cloud backup first.");
  if (summary.isExpired) return refreshSupabaseCloudSession(settings);
  return loadStoredCloudSession();
}

async function supabaseRestFetch(settings, path, options = {}) {
  const config = getCloudConfigOrThrow(settings);
  const session = await getValidCloudSession(settings);
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(config, session),
      ...(options.headers || {})
    }
  });
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
  const payload = createBackupPayload(appData, exportedAt);
  payload.source = "supabase-cloud-backup";
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
    source: "manual-cloud-backup"
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
  return `-- GH Budgeting V2.6 cloud backup table\n-- Run this in Supabase SQL Editor after creating a project.\n\ncreate table if not exists public.gh_cloud_backups (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references auth.users(id) on delete cascade,\n  profile_id text,\n  backup_label text,\n  backup_format_version text,\n  app_version text,\n  data_schema_version text,\n  counts jsonb not null default '{}'::jsonb,\n  backup_json jsonb not null,\n  source text not null default 'manual-cloud-backup',\n  client_generated_at timestamptz,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\nalter table public.gh_cloud_backups enable row level security;\n\ndrop policy if exists "GH users can read own backups" on public.gh_cloud_backups;\ndrop policy if exists "GH users can insert own backups" on public.gh_cloud_backups;\ndrop policy if exists "GH users can update own backups" on public.gh_cloud_backups;\ndrop policy if exists "GH users can delete own backups" on public.gh_cloud_backups;\n\ncreate policy "GH users can read own backups"\n  on public.gh_cloud_backups for select\n  using (auth.uid() = user_id);\n\ncreate policy "GH users can insert own backups"\n  on public.gh_cloud_backups for insert\n  with check (auth.uid() = user_id);\n\ncreate policy "GH users can update own backups"\n  on public.gh_cloud_backups for update\n  using (auth.uid() = user_id)\n  with check (auth.uid() = user_id);\n\ncreate policy "GH users can delete own backups"\n  on public.gh_cloud_backups for delete\n  using (auth.uid() = user_id);\n\ncreate index if not exists gh_cloud_backups_user_created_idx\n  on public.gh_cloud_backups (user_id, created_at desc);`;
}
