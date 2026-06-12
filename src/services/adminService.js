export const STABLE_PRODUCTION_APP_URL = "https://guinness-budgeting.vercel.app";

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

function splitEmails(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

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

function hasAdminRole(user = {}) {
  const candidates = [
    user.role,
    user.app_metadata?.role,
    user.user_metadata?.role,
    user.app_metadata?.user_role,
    user.user_metadata?.user_role
  ].map(value => String(value || "").toLowerCase());

  return Boolean(
    user.app_metadata?.admin ||
    user.user_metadata?.admin ||
    user.is_admin ||
    candidates.some(value => ["admin", "owner", "super_admin"].includes(value))
  );
}

export function getAdminStatus(cloudAuthSummary = {}, settings = {}) {
  const user = cloudAuthSummary?.user || {};
  const email = String(user.email || cloudAuthSummary?.email || "").trim().toLowerCase();
  const allowedEmails = splitEmails(import.meta.env.VITE_ADMIN_EMAILS);
  const signedIn = Boolean(cloudAuthSummary?.signedIn);
  const metadataAdmin = signedIn && hasAdminRole(user);
  const allowlistAdmin = signedIn && email && allowedEmails.includes(email);
  const localAdminEmails = splitEmails(settings?.admin?.localAdminEmails);
  const localAdmin = signedIn && email && localAdminEmails.includes(email);
  const isAdmin = Boolean(metadataAdmin || allowlistAdmin || localAdmin);

  return {
    isAdmin,
    signedIn,
    email,
    reason: metadataAdmin
      ? "Supabase user metadata marks this account as admin."
      : allowlistAdmin
        ? "This account is listed in VITE_ADMIN_EMAILS."
        : localAdmin
          ? "This account is listed in local admin settings."
          : signedIn
            ? "Signed in, but no admin role or allowlist entry was found."
            : "Sign in with an admin account to open the Control Centre.",
    requiresSecureAdminRpc: true
  };
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
