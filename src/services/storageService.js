import { defaultCategories } from "../data/defaultCategories.js";
const STORAGE_KEY = "guinness-budgeting-data-v1";
const CORRUPT_SNAPSHOT_PREFIX = "guinness-budgeting-corrupt-snapshot";

export const APP_VERSION = "2.0";
export const DATA_SCHEMA_VERSION = "2.0";
export const BACKUP_FORMAT_VERSION = "1.1";

const REQUIRED_ARRAY_FIELDS = [
  "transactions",
  "accounts",
  "categories",
  "budgets",
  "recurringItems",
  "savingsGoals",
  "closedMonths"
];

const OPTIONAL_ARRAY_FIELDS = ["accountAdjustments", "importBatches", "importRules", "transferRules", "externalAccountMappings"];

const DEFAULT_PROFILE_TYPE = "Personal";

function createLocalProfileId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `profile_${crypto.randomUUID()}`;
  }
  return `profile_${Date.now().toString(36)}`;
}

function createDefaultProfile(existingProfile = {}, settings = {}) {
  const now = new Date().toISOString();
  return {
    localProfileId: existingProfile.localProfileId || createLocalProfileId(),
    cloudUserId: existingProfile.cloudUserId || null,
    displayName: existingProfile.displayName || "",
    email: existingProfile.email || "",
    profileName: existingProfile.profileName || "Personal Budget",
    profileType: existingProfile.profileType || DEFAULT_PROFILE_TYPE,
    notes: existingProfile.notes || "",
    currency: existingProfile.currency || settings.currency || "GBP",
    currencySymbol: existingProfile.currencySymbol || settings.currencySymbol || "£",
    monthMode: existingProfile.monthMode || settings.monthMode || "calendar",
    customMonthStartDay: Number(existingProfile.customMonthStartDay || settings.customMonthStartDay || 1),
    syncEnabled: Boolean(existingProfile.syncEnabled),
    createdAt: existingProfile.createdAt || now,
    updatedAt: existingProfile.updatedAt || now
  };
}

export function loadAppData() {
  let raw = null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normaliseAppData(JSON.parse(raw)) : null;
  } catch (error) {
    console.error("Failed to load app data:", error);
    preserveCorruptStorageSnapshot(raw, error);
    return null;
  }
}

export function saveAppData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normaliseAppData(data)));
  } catch (error) {
    console.error("Failed to save app data:", error);
  }
}

export function clearAppData() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function exportJsonBackup(data, exportedAt = new Date().toISOString(), forcedFilename = null) {
  const filename = forcedFilename || buildBackupFilename(exportedAt);
  const payload = createBackupPayload(data, exportedAt);
  const result = await saveJsonPayload(payload, filename, "Guinness Budgeting backup");
  return { ...result, exportedAt };
}

export async function exportRawSavedData(exportedAt = new Date().toISOString()) {
  const rawText = localStorage.getItem(STORAGE_KEY) || "";
  let parsedData = null;
  let parseError = null;

  try {
    parsedData = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    parseError = error.message || "Could not parse raw localStorage data.";
  }

  const filename = buildRawDataFilename(exportedAt);
  const payload = {
    appName: "Guinness Budgeting",
    exportType: "emergency-raw-local-storage",
    appVersion: APP_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    exportedAt,
    storageKey: STORAGE_KEY,
    parseError,
    rawText,
    parsedData
  };

  const result = await saveJsonPayload(payload, filename, "Guinness Budgeting raw saved data");
  return { ...result, exportedAt };
}

export function createBackupPayload(data, exportedAt = new Date().toISOString()) {
  const safeData = normaliseAppData(data);

  return {
    appName: "Guinness Budgeting",
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    exportedAt,
    source: "local-browser-storage",
    profile: {
      localProfileId: safeData.profile.localProfileId,
      displayName: safeData.profile.displayName,
      profileName: safeData.profile.profileName,
      profileType: safeData.profile.profileType,
      syncEnabled: safeData.profile.syncEnabled
    },
    counts: getBackupCounts(safeData),
    data: safeData
  };
}

export async function parseBackupFile(file) {
  const rawText = await file.text();
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error("This is not a valid JSON file. Choose a Guinness Budgeting backup file.");
  }

  return parseBackupObject(parsed, file.name);
}

export function parseBackupObject(parsed, filename = "backup file") {
  const isWrappedBackup = parsed && typeof parsed === "object" && parsed.data && parsed.appName;
  const candidateData = isWrappedBackup ? parsed.data : parsed;
  const warnings = [];

  const validation = validateAppData(candidateData);
  if (!validation.ok) {
    throw new Error(`This file cannot be restored: ${validation.errors.join(" ")}`);
  }

  if (!isWrappedBackup) {
    warnings.push("This looks like an older raw data export. It can be restored, but it does not include full backup metadata.");
  }

  if (isWrappedBackup && parsed.appName && parsed.appName !== "Guinness Budgeting") {
    warnings.push("This backup does not identify itself as a Guinness Budgeting backup.");
  }

  const restoredData = normaliseAppData(candidateData);

  return {
    filename,
    warnings,
    meta: {
      appName: parsed.appName || "Guinness Budgeting",
      backupFormatVersion: parsed.backupFormatVersion || "legacy/raw-data",
      appVersion: parsed.appVersion || parsed?.settings?.appVersion || "unknown",
      dataSchemaVersion: parsed.dataSchemaVersion || parsed?.settings?.dataVersion || "unknown",
      exportedAt: parsed.exportedAt || parsed?.settings?.lastBackupAt || null,
      source: parsed.source || "unknown"
    },
    profile: restoredData.profile,
    counts: getBackupCounts(restoredData),
    data: restoredData
  };
}

export function prepareDataForBackupExport(data, exportedAt = new Date().toISOString()) {
  const filename = buildBackupFilename(exportedAt);
  const nextData = normaliseAppData({
    ...data,
    settings: {
      ...(data.settings || {}),
      lastBackupAt: exportedAt,
      lastBackupFilename: filename,
      dataVersion: DATA_SCHEMA_VERSION,
      appVersion: APP_VERSION
    }
  });

  return { nextData, filename, exportedAt };
}

export function prepareRestoredAppData(backupData, filename, restoredAt = new Date().toISOString(), backupMeta = {}) {
  const safeData = normaliseAppData(backupData);

  return normaliseAppData({
    ...safeData,
    settings: {
      ...safeData.settings,
      hasStarted: true,
      lastRestoredAt: restoredAt,
      lastRestoredFilename: filename,
      restoredFromBackupExportedAt: backupMeta.exportedAt || null,
      restoredFromBackupVersion: backupMeta.backupFormatVersion || null,
      dataVersion: DATA_SCHEMA_VERSION,
      appVersion: APP_VERSION
    }
  });
}

export function validateAppData(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["Backup data is missing or not an object."], warnings };
  }

  REQUIRED_ARRAY_FIELDS.forEach(field => {
    if (!Array.isArray(data[field])) {
      errors.push(`Missing required list: ${field}.`);
    }
  });

  OPTIONAL_ARRAY_FIELDS.forEach(field => {
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      warnings.push(`${field} exists but is not a list. It will be reset to an empty list.`);
    }
  });

  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    errors.push("Missing settings object.");
  }

  if (data.profile !== undefined && (typeof data.profile !== "object" || Array.isArray(data.profile))) {
    warnings.push("Profile data is damaged. A blank local profile will be recreated.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function mergeMissingDefaultCategories(categories) {
  const existing = Array.isArray(categories) ? categories : [];
  const existingIds = new Set(existing.map(category => category.id));
  const missingDefaults = defaultCategories.filter(category => !existingIds.has(category.id));
  return [...existing, ...missingDefaults];
}

export function normaliseAppData(data) {
  const base = data && typeof data === "object" ? data : {};
  const next = { ...base };

  REQUIRED_ARRAY_FIELDS.forEach(field => {
    next[field] = Array.isArray(base[field]) ? base[field] : [];
  });

  OPTIONAL_ARRAY_FIELDS.forEach(field => {
    next[field] = Array.isArray(base[field]) ? base[field] : [];
  });

  next.categories = mergeMissingDefaultCategories(next.categories);

  const baseSettings = base.settings && typeof base.settings === "object" && !Array.isArray(base.settings)
    ? base.settings
    : {};
  const profileSource = base.profile && typeof base.profile === "object" && !Array.isArray(base.profile)
    ? base.profile
    : {};
  const profile = createDefaultProfile(profileSource, baseSettings);

  next.profile = profile;
  next.settings = {
    ...baseSettings,
    currency: profile.currency || baseSettings.currency || "GBP",
    currencySymbol: profile.currencySymbol || baseSettings.currencySymbol || "£",
    monthMode: profile.monthMode || baseSettings.monthMode || "calendar",
    customMonthStartDay: Number(profile.customMonthStartDay || baseSettings.customMonthStartDay || 1),
    dataVersion: DATA_SCHEMA_VERSION,
    appVersion: APP_VERSION
  };

  return next;
}

export function getBackupCounts(data) {
  const safeData = normaliseAppData(data);

  return {
    transactions: safeData.transactions.length,
    accounts: safeData.accounts.length,
    categories: safeData.categories.length,
    budgets: safeData.budgets.length,
    recurringItems: safeData.recurringItems.length,
    savingsGoals: safeData.savingsGoals.length,
    closedMonths: safeData.closedMonths.length,
    accountAdjustments: safeData.accountAdjustments.length,
    importBatches: safeData.importBatches.length,
    importRules: safeData.importRules.length,
    transferRules: safeData.transferRules.length,
    externalAccountMappings: safeData.externalAccountMappings.length
  };
}

export function getBackupReminder(lastBackupAt, now = new Date()) {
  if (!lastBackupAt) {
    return {
      level: "warning",
      title: "No backup recorded",
      message: "Export a backup before adding a lot of real data.",
      ageDays: null
    };
  }

  const backupDate = new Date(lastBackupAt);
  if (Number.isNaN(backupDate.getTime())) {
    return {
      level: "warning",
      title: "Backup date unreadable",
      message: "Export a fresh backup so the app has a reliable recovery point.",
      ageDays: null
    };
  }

  const ageDays = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays >= 14) {
    return {
      level: "danger",
      title: "Backup is more than 14 days old",
      message: "Export a fresh backup before making more changes.",
      ageDays
    };
  }

  if (ageDays >= 7) {
    return {
      level: "notice",
      title: "Backup is more than 7 days old",
      message: "Consider exporting a fresh backup soon.",
      ageDays
    };
  }

  return {
    level: "ok",
    title: "Backup looks recent",
    message: "Your last recorded backup is recent.",
    ageDays
  };
}

export function getStorageHealth(data) {
  const validation = validateAppData(data);
  const safeData = normaliseAppData(data);
  const raw = localStorage.getItem(STORAGE_KEY) || "";
  const approxBytes = new Blob([raw]).size;
  const counts = getBackupCounts(safeData);
  const reminder = getBackupReminder(safeData.settings.lastBackupAt);

  return {
    ok: validation.ok,
    status: validation.ok ? "OK" : "Needs attention",
    storageType: "localStorage",
    storageKey: STORAGE_KEY,
    approxBytes,
    approxKilobytes: Math.round((approxBytes / 1024) * 10) / 10,
    errors: validation.errors,
    warnings: validation.warnings,
    counts,
    reminder
  };
}

export function buildRestoreComparisonWarnings(currentData, preview) {
  const warnings = [];
  if (!preview) return warnings;

  const current = normaliseAppData(currentData);
  const currentCounts = getBackupCounts(current);
  const backupCounts = preview.counts || getBackupCounts(preview.data);

  if (backupCounts.transactions < currentCounts.transactions) {
    warnings.push(`Backup has fewer transactions than the current app (${backupCounts.transactions} vs ${currentCounts.transactions}). Restoring may remove newer transactions.`);
  }

  if (backupCounts.accounts < currentCounts.accounts) {
    warnings.push(`Backup has fewer accounts than the current app (${backupCounts.accounts} vs ${currentCounts.accounts}).`);
  }

  if (backupCounts.recurringItems < currentCounts.recurringItems) {
    warnings.push(`Backup has fewer recurring items than the current app (${backupCounts.recurringItems} vs ${currentCounts.recurringItems}).`);
  }

  const currentLastBackup = current.settings.lastBackupAt ? new Date(current.settings.lastBackupAt) : null;
  const backupExportedAt = preview.meta.exportedAt ? new Date(preview.meta.exportedAt) : null;

  if (
    currentLastBackup &&
    backupExportedAt &&
    !Number.isNaN(currentLastBackup.getTime()) &&
    !Number.isNaN(backupExportedAt.getTime()) &&
    backupExportedAt.getTime() < currentLastBackup.getTime()
  ) {
    warnings.push("This backup was exported before your latest recorded backup. It may be older than your current data.");
  }

  if (preview.meta.dataSchemaVersion !== "unknown" && preview.meta.dataSchemaVersion !== DATA_SCHEMA_VERSION) {
    warnings.push(`Backup data version is ${preview.meta.dataSchemaVersion}; current app data version is ${DATA_SCHEMA_VERSION}.`);
  }

  return warnings;
}

export function buildBackupFilename(exportedAt = new Date().toISOString()) {
  const dateStamp = exportedAt.slice(0, 10);
  const timeStamp = exportedAt.slice(11, 16).replace(":", "");
  return `Guinness-Budgeting-Backup-${dateStamp}-${timeStamp}.json`;
}

export function buildRawDataFilename(exportedAt = new Date().toISOString()) {
  const dateStamp = exportedAt.slice(0, 10);
  const timeStamp = exportedAt.slice(11, 16).replace(":", "");
  return `Guinness-Budgeting-Raw-Storage-${dateStamp}-${timeStamp}.json`;
}

export function downloadUrl(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function saveJsonPayload(payload, filename, description) {
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });

  const canUseSavePicker =
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function" &&
    window.isSecureContext;

  if (canUseSavePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description,
            accept: { "application/json": [".json"] }
          }
        ],
        excludeAcceptAllOption: false
      });

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      return { ok: true, filename, method: "save-picker" };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { ok: false, cancelled: true, filename, method: "save-picker" };
      }

      console.warn("Save picker failed; falling back to browser download:", error);
    }
  }

  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);

  return { ok: true, filename, method: "download" };
}

function preserveCorruptStorageSnapshot(raw, error) {
  if (!raw) return;

  try {
    const key = `${CORRUPT_SNAPSHOT_PREFIX}-${new Date().toISOString()}`;
    const payload = {
      capturedAt: new Date().toISOString(),
      appName: "Guinness Budgeting",
      appVersion: APP_VERSION,
      storageKey: STORAGE_KEY,
      error: error?.message || "Unknown load error",
      rawText: raw
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (snapshotError) {
    console.error("Failed to preserve corrupt storage snapshot:", snapshotError);
  }
}
