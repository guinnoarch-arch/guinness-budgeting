import {
  getStoredCloudSessionSummary,
  isCloudBackupConfigured,
  supabaseRestFetch
} from "./cloudBackupService.js";

export const STABLE_PRODUCTION_APP_URL = "https://guinness-budgeting.vercel.app";
export const ADMIN_ROUTE_PATH = "/admin";
export const ADMIN_ROLE_FIELD = "public.profiles.role";
export const ADMIN_ROLE_VALUE = "admin";

export const DEFAULT_FEATURE_FLAGS = {
  bankLinkingBeta: false,
  csvImport: true,
  loans: true,
  stocks: false,
  aiAssistant: false,
  experimentalMobileLayout: true,
  maintenanceMode: false,
  backupReminders: true,
  qrPhoneAccess: true
};

export const FEATURE_FLAG_DETAILS = {
  bankLinkingBeta: {
    label: "Bank linking beta",
    description: "Placeholder only. No live bank integration is enabled.",
    defaultValue: false
  },
  csvImport: {
    label: "CSV import",
    description: "Allow local CSV import/export tools.",
    defaultValue: true
  },
  loans: {
    label: "Loans",
    description: "Show loan pages and loan-linked controls.",
    defaultValue: true
  },
  stocks: {
    label: "Stocks tracker",
    description: "Reserved for a future investment view.",
    defaultValue: false
  },
  aiAssistant: {
    label: "AI assistant",
    description: "Reserved for future assistant features.",
    defaultValue: false
  },
  experimentalMobileLayout: {
    label: "Phone layout refinements",
    description: "Keep compact phone-mode interface updates active.",
    defaultValue: true
  },
  maintenanceMode: {
    label: "Maintenance notice",
    description: "Show a non-blocking maintenance banner.",
    defaultValue: false
  },
  backupReminders: {
    label: "Backup reminders",
    description: "Show backup warning banners and urgency states.",
    defaultValue: true
  },
  qrPhoneAccess: {
    label: "Open on phone QR",
    description: "Show the QR button for opening the app on another device.",
    defaultValue: true
  }
};

export const DEFAULT_ADMIN_ACCESS_STATE = {
  loaded: false,
  signedIn: false,
  isAdmin: false,
  role: "user",
  email: "",
  currentUserId: "",
  adminExists: false,
  adminCount: 0,
  profileCount: 0,
  adminClaimEnabled: false,
  canClaimAdmin: false,
  isBlocked: false,
  error: "",
  reason: "Admin state has not loaded yet."
};

export function normaliseFeatureFlags(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_FEATURE_FLAGS).map(([key, defaultValue]) => {
      if (source[key] === undefined) return [key, defaultValue];
      if (source[key] === "false") return [key, false];
      if (source[key] === "true") return [key, true];
      return [key, Boolean(source[key])];
    })
  );
}

export function getFeatureFlags(settings = {}) {
  return normaliseFeatureFlags(settings?.featureFlags);
}

export function normaliseAdminAccessState(value = {}, cloudAuthSummary = getStoredCloudSessionSummary()) {
  const signedIn = Boolean(cloudAuthSummary?.signedIn);
  const role = String(value.role || value.current_role || "user").toLowerCase();
  const isAdmin = Boolean(value.isAdmin ?? value.is_admin ?? role === ADMIN_ROLE_VALUE);
  const adminExists = Boolean(value.adminExists ?? value.admin_exists ?? Number(value.admin_count || 0) > 0);
  const adminClaimEnabled = Boolean(value.adminClaimEnabled ?? value.admin_claim_enabled);
  const isBlocked = Boolean(value.isBlocked ?? value.is_blocked ?? value.blocked);
  const canClaimAdmin = signedIn && !isBlocked && !isAdmin && (!adminExists || adminClaimEnabled);

  return {
    ...DEFAULT_ADMIN_ACCESS_STATE,
    ...value,
    loaded: Boolean(value.loaded),
    signedIn,
    isAdmin,
    role,
    email: String(value.email || value.current_email || cloudAuthSummary?.user?.email || "").trim().toLowerCase(),
    currentUserId: String(value.currentUserId || value.current_user_id || cloudAuthSummary?.user?.id || ""),
    adminExists,
    adminCount: Number(value.adminCount ?? value.admin_count ?? 0),
    profileCount: Number(value.profileCount ?? value.profile_count ?? 0),
    adminClaimEnabled,
    canClaimAdmin,
    isBlocked,
    error: value.error || "",
    reason: value.reason || (isBlocked
      ? "Your account has been blocked. Contact the app admin."
      : isAdmin
      ? `Admin role confirmed from ${ADMIN_ROLE_FIELD}.`
      : signedIn
        ? "Signed in, but this Supabase profile is not admin."
        : "Sign in before opening the Admin Control Centre.")
  };
}

export function getAdminStatus(adminAccessState = DEFAULT_ADMIN_ACCESS_STATE, cloudAuthSummary = getStoredCloudSessionSummary()) {
  return normaliseAdminAccessState(adminAccessState, cloudAuthSummary);
}

function normaliseRpcRow(body) {
  if (Array.isArray(body)) return body[0] || {};
  return body || {};
}

export async function fetchAdminAccessState(settings = {}, cloudAuthSummary = getStoredCloudSessionSummary()) {
  if (!cloudAuthSummary?.signedIn) {
    return normaliseAdminAccessState({
      loaded: true,
      reason: "Sign in before opening the Admin Control Centre."
    }, cloudAuthSummary);
  }

  if (!isCloudBackupConfigured(settings)) {
    return normaliseAdminAccessState({
      loaded: true,
      error: "Supabase is not configured for this build.",
      reason: "Supabase is not configured, so admin role cannot be checked."
    }, cloudAuthSummary);
  }

  try {
    const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_get_admin_access_state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }));
    return normaliseAdminAccessState({ ...row, loaded: true }, cloudAuthSummary);
  } catch (error) {
    return normaliseAdminAccessState({
      loaded: true,
      error: error.message || "Admin access check failed.",
      reason: "Admin access could not be checked. Run the updated Supabase SQL setup."
    }, cloudAuthSummary);
  }
}

export async function claimAdminRole(settings = {}) {
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_claim_admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  }));
  return normaliseAdminAccessState({ ...row, loaded: true }, getStoredCloudSessionSummary(settings));
}

export async function setAdminClaimMode(settings = {}, enabled) {
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_set_admin_claim_mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: Boolean(enabled) })
  }));
  return normaliseAdminAccessState({ ...row, loaded: true }, getStoredCloudSessionSummary(settings));
}

export async function listAdminAuditLog(settings = {}, limit = 30) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_admin_audit_recent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit_count: Number(limit) || 30 })
  });
  return Array.isArray(rows) ? rows : [];
}

export async function listAdminUsers(settings = {}) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_admin_list_users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return Array.isArray(rows) ? rows : [];
}

export async function setAdminUserRole(settings = {}, targetUserId, newRole) {
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_admin_set_user_role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_user_id: targetUserId,
      new_role: newRole
    })
  }));
  return row;
}

export async function setAdminUserBlocked(settings = {}, targetUserId, blocked) {
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_admin_set_user_blocked", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_user_id: targetUserId,
      target_blocked: Boolean(blocked)
    })
  }));
  return row;
}

export async function submitFeatureSuggestion(settings = {}, message) {
  const text = String(message || "").trim();
  if (!text) throw new Error("Enter a suggestion first.");
  if (!getStoredCloudSessionSummary(settings)?.signedIn || !isCloudBackupConfigured(settings)) {
    throw new Error("Suggestion saved locally because cloud suggestion sync is not available.");
  }
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_submit_feature_suggestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_message: text })
  }));
  return row;
}

export async function listAdminFeatureSuggestions(settings = {}, status = "all") {
  const rows = await supabaseRestFetch(settings, "rpc/gh_admin_list_feature_suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_status: status === "all" ? null : status })
  });
  return Array.isArray(rows) ? rows : [];
}

export async function listFeatureSuggestions(settings = {}, status = "all") {
  const rows = await supabaseRestFetch(settings, "rpc/gh_list_feature_suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_status: status === "all" ? null : status })
  });
  return Array.isArray(rows) ? rows : [];
}

export async function voteFeatureSuggestion(settings = {}, suggestionId, voteValue) {
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_vote_feature_suggestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_suggestion_id: suggestionId,
      p_vote: voteValue
    })
  }));
  return row;
}

export async function updateAdminFeatureSuggestion(settings = {}, suggestionId, status, adminNote = "") {
  const row = normaliseRpcRow(await supabaseRestFetch(settings, "rpc/gh_admin_update_feature_suggestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_suggestion_id: suggestionId,
      p_status: status,
      p_admin_note: adminNote
    })
  }));
  return row;
}

export function createAdminAuditEntry(action, details = {}, actor = {}) {
  return {
    id: `admin_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action: String(action || "admin_action"),
    details,
    actorEmail: String(actor.email || "").trim().toLowerCase() || "unknown",
    createdAt: new Date().toISOString()
  };
}

export function appendAdminAuditLog(settings = {}, entry) {
  const current = Array.isArray(settings.adminAuditLog) ? settings.adminAuditLog : [];
  return [entry, ...current].slice(0, 50);
}

export function setFeatureFlag(settings = {}, key, enabled, actor = {}) {
  const nextFlags = {
    ...getFeatureFlags(settings),
    [key]: Boolean(enabled)
  };
  const entry = createAdminAuditEntry("feature_flag_changed", { key, enabled: Boolean(enabled) }, actor);

  return {
    ...settings,
    featureFlags: nextFlags,
    adminAuditLog: appendAdminAuditLog(settings, entry)
  };
}
