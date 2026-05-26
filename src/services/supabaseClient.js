import { GH_SUPABASE_ANON_KEY, GH_SUPABASE_PROJECT_URL } from "../config/supabaseProjectConfig.js";

// Previous patch/config typos that should never be used again.
const KNOWN_SUPABASE_URL_FIXES = new Map([
  ["https://dccsjmheflbisrdjzme.supabase.co", GH_SUPABASE_PROJECT_URL]
]);

const KNOWN_SUPABASE_KEY_FIXES = new Map([
  ["sb_publishable_qhZDZGZTzXZ7OeoNlwv6v9A_JBDRbrkh", GH_SUPABASE_ANON_KEY],
  ["sb_publishable_qhZDZGZTzXZ7OeoNIw6v9A_JBDRbrkh", GH_SUPABASE_ANON_KEY],
  ["sb_publishable_qhZDZGZTzXZ70eoNlwv6v9A_JBDRbrkh", GH_SUPABASE_ANON_KEY]
]);

export function getViteEnvValue(name) {
  try {
    return import.meta.env?.[name] || "";
  } catch {
    return "";
  }
}

function normaliseConfiguredValue(value) {
  return String(value || "").trim();
}

function isPlaceholderValue(value) {
  const text = normaliseConfiguredValue(value).toLowerCase();
  return !text
    || text.includes("your-project")
    || text.includes("your-supabase")
    || text.includes("your_supabase")
    || text.includes("placeholder")
    || text === "your-supabase-anon-public-key";
}

function shouldUseEnvOverride() {
  const flag = String(getViteEnvValue("VITE_SUPABASE_USE_ENV_OVERRIDE") || "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

function correctKnownProjectUrl(value) {
  const trimmed = trimSupabaseUrl(value);
  return KNOWN_SUPABASE_URL_FIXES.get(trimmed) || trimmed;
}

function correctKnownProjectKey(value) {
  const trimmed = normaliseConfiguredValue(value);
  return KNOWN_SUPABASE_KEY_FIXES.get(trimmed) || trimmed;
}

function cleanConfigValue(value) {
  const trimmed = normaliseConfiguredValue(value);
  return isPlaceholderValue(trimmed) ? "" : trimmed;
}

export function getDefaultSupabaseConfigFromEnv() {
  const appUrl = correctKnownProjectUrl(GH_SUPABASE_PROJECT_URL);
  const appKey = correctKnownProjectKey(GH_SUPABASE_ANON_KEY);

  // The app-owned values are the source of truth. Environment override exists
  // only for deliberate developer testing, so a bad Vercel/local env var cannot
  // accidentally break the personal deployment again.
  if (!shouldUseEnvOverride()) {
    return {
      supabaseUrl: appUrl,
      supabaseAnonKey: appKey
    };
  }

  const envUrl = correctKnownProjectUrl(cleanConfigValue(getViteEnvValue("VITE_SUPABASE_URL")));
  const envKey = correctKnownProjectKey(cleanConfigValue(getViteEnvValue("VITE_SUPABASE_ANON_KEY")));

  return {
    supabaseUrl: envUrl || appUrl,
    supabaseAnonKey: envKey || appKey
  };
}

export function getSupabaseClientConfig() {
  const env = getDefaultSupabaseConfigFromEnv();
  return {
    url: correctKnownProjectUrl(env.supabaseUrl),
    anonKey: correctKnownProjectKey(env.supabaseAnonKey)
  };
}

export function isSupabaseConfigured() {
  const config = getSupabaseClientConfig();
  return Boolean(config.url && config.anonKey && isValidSupabaseProjectUrl(config.url) && !getSupabaseKeySafetyIssue(config.anonKey));
}

export const supabase = {
  get url() {
    return getSupabaseClientConfig().url;
  },
  get anonKey() {
    return getSupabaseClientConfig().anonKey;
  },
  get isConfigured() {
    return isSupabaseConfigured();
  }
};

export function trimSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function isSupabasePublishableKey(value) {
  return String(value || "").trim().startsWith("sb_publishable_");
}

export function getSupabaseKeySafetyIssue(value) {
  const key = correctKnownProjectKey(String(value || "").trim());
  if (!key) return null;

  if (isPlaceholderValue(key)) {
    return "Cloud login is not configured for this build.";
  }

  const lowerKey = key.toLowerCase();
  if (lowerKey.includes("service_role") || lowerKey.includes("service-role") || lowerKey.startsWith("sb_secret_")) {
    return "Use the Supabase publishable/anon public key in the browser, never a service-role or secret key.";
  }

  const jwtParts = key.split(".");
  if (jwtParts.length >= 2 && typeof atob === "function") {
    try {
      const payloadText = atob(jwtParts[1].replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(payloadText);
      if (payload?.role === "service_role") {
        return "This looks like a Supabase service-role key. Remove it and use the anon public key instead.";
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function isValidSupabaseProjectUrl(value) {
  const url = correctKnownProjectUrl(value);
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && !isPlaceholderValue(url);
}

export function parseSupabaseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function readSupabaseResponse(response) {
  const text = await response.text();
  const parsed = parseSupabaseJson(text);

  if (!response.ok) {
    const rawMessage = parsed?.msg || parsed?.message || parsed?.error_description || parsed?.hint || parsed?.details || text || `Supabase request failed with status ${response.status}.`;
    const message = /invalid api key/i.test(String(rawMessage))
      ? "Supabase rejected the app publishable key. This usually means the app is using an old/incorrect key. Check src/config/supabaseProjectConfig.js and redeploy."
      : rawMessage;
    throw new Error(message);
  }

  return parsed;
}
