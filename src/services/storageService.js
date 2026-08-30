import { defaultCategories } from "../data/defaultCategories.js";
import { createId } from "../utils/ids.js";
import {
  ensureHousesFromMortgageLoans,
  normaliseHouseContributionRecord,
  normaliseHouseInviteRecord,
  normaliseHouseMemberRecord,
  normaliseHouseOwnershipSplitRecord,
  normaliseHousePersonRecord
} from "../utils/houseTracking.js";
import { normaliseFeatureFlags } from "./adminService.js";
import { exportReceiptBackupRecords } from "./receiptStorageService.js";
import {
  addStorageLog,
  clearAppDataSnapshots,
  clearCurrentAppDataRecord,
  getIndexedDbStorageStats,
  isAppIndexedDbAvailable,
  isPersistentBrowserStorageGranted,
  readCurrentAppDataRecord,
  readIndexedDbRawExport,
  requestPersistentBrowserStorage,
  saveAppDataSnapshot,
  saveCurrentAppDataRecord
} from "./indexedDbStorageService.js";

const STORAGE_KEY = "guinness-budgeting-data-v1";
const STORAGE_META_KEY = "guinness-budgeting-storage-meta-v2";
const LEGACY_MIGRATION_SNAPSHOT_KEY = "guinness-budgeting-v2-5-localstorage-migration-snapshot";
const CORRUPT_SNAPSHOT_PREFIX = "guinness-budgeting-corrupt-snapshot";

export const APP_VERSION = "2.6.27";
export const DATA_SCHEMA_VERSION = "2.6.27";
export const BACKUP_FORMAT_VERSION = "1.9";

export const STORAGE_LOAD_FAILURE_CODE = "GH_STORAGE_LOAD_FAILED";

const REQUIRED_ARRAY_FIELDS = [
  "transactions",
  "accounts",
  "categories",
  "budgets",
  "recurringItems",
  "savingsGoals",
  "closedMonths"
];

const OPTIONAL_ARRAY_FIELDS = [
  "accountAdjustments",
  "importBatches",
  "importRules",
  "transferRules",
  "externalAccountMappings",
  "csvColumnMappings",
  "profiles",
  "loans",
  "loanEvents",
  "houses",
  "housePeople",
  "houseContributions",
  "houseMembers",
  "houseInvites",
  "houseOwnershipSplits",
  "activityLog",
  "budgetTemplates",
  "plannedTransactions"
];

const DEFAULT_PROFILE_TYPE = "Personal";

function createLocalProfileId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `profile_${crypto.randomUUID()}`;
  }
  return `profile_${Date.now().toString(36)}`;
}

function createStorageLoadFailure(indexedDbError) {
  const message = indexedDbError?.message
    ? `Saved app data could not be loaded from IndexedDB: ${indexedDbError.message}`
    : "Saved app data could not be loaded from IndexedDB.";
  const error = new Error(message);
  error.code = STORAGE_LOAD_FAILURE_CODE;
  error.recoverable = true;
  error.cause = indexedDbError || null;
  return error;
}

function createDefaultProfile(existingProfile = {}, settings = {}) {
  const now = new Date().toISOString();
  const localProfileId = existingProfile.localProfileId || existingProfile.id || createLocalProfileId();
  const displayName = existingProfile.displayName || existingProfile.username || "";

  return {
    id: localProfileId,
    localProfileId,
    cloudUserId: existingProfile.cloudUserId || null,
    username: existingProfile.username || displayName || "",
    displayName,
    email: existingProfile.email || "",
    profileName: existingProfile.profileName || "Personal Budget",
    profileType: existingProfile.profileType || DEFAULT_PROFILE_TYPE,
    notes: existingProfile.notes || "",
    currency: existingProfile.currency || settings.currency || "GBP",
    currencySymbol: existingProfile.currencySymbol || settings.currencySymbol || "£",
    monthMode: existingProfile.monthMode || settings.monthMode || "calendar",
    customMonthStartDay: Number(existingProfile.customMonthStartDay || settings.customMonthStartDay || 1),
    syncEnabled: Boolean(existingProfile.syncEnabled),
    localOnly: existingProfile.localOnly !== false,
    createdAt: existingProfile.createdAt || now,
    updatedAt: existingProfile.updatedAt || now
  };
}

function applyActiveProfileToRecords(records, activeProfileId) {
  return (records || []).map(record => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return record;
    return {
      ...record,
      profileId: record.profileId || activeProfileId
    };
  });
}

export function loadAppData() {
  return loadLegacyLocalStorageData();
}

function readDataVersion(data, fallback = "unknown") {
  return data?.settings?.dataVersion || data?.settings?.appVersion || data?.dataSchemaVersion || data?.appVersion || fallback;
}

function buildMigrationActions(previousVersion, source) {
  const actions = [
    "Normalised required lists and optional app sections.",
    "Filled missing settings defaults.",
    "Preserved archived categories, archived savings goals, loans, imports, accounts, settings, and closed months."
  ];

  if (source === "localStorage") {
    actions.unshift("Migrated legacy localStorage data into the current browser storage record.");
  }

  if (previousVersion === DATA_SCHEMA_VERSION) {
    actions.push("Data was already on the current schema; no structural migration was required.");
  }

  return actions;
}

function buildMigrationSettingsPatch(previousVersion, migratedAt, warnings = []) {
  return previousVersion && previousVersion !== DATA_SCHEMA_VERSION
    ? {
        lastMigrationRunAt: migratedAt,
        lastMigrationPreviousVersion: previousVersion,
        lastMigrationNewVersion: DATA_SCHEMA_VERSION,
        lastMigrationWarnings: warnings,
        lastMigrationError: null
      }
    : {};
}

async function writeStorageLogSafely(entry) {
  try {
    await addStorageLog(entry);
  } catch (error) {
    console.warn("Could not write storage log:", error);
  }
}

export async function loadAppDataAsync() {
  let indexedDbError = null;

  if (isAppIndexedDbAvailable()) {
    try {
      const record = await readCurrentAppDataRecord();
      if (record?.data) {
        const loadedAt = new Date().toISOString();
        const previousVersion = readDataVersion(record.data, record.dataSchemaVersion || record.appVersion || "unknown");
        const normalisedData = normaliseAppData({
          ...record.data,
          settings: {
            ...(record.data.settings || {}),
            ...buildMigrationSettingsPatch(previousVersion, loadedAt),
            storageMode: "indexedDB",
            storagePrimary: "indexedDB",
            lastIndexedDbLoadAt: loadedAt,
            dataVersion: DATA_SCHEMA_VERSION,
            appVersion: APP_VERSION
          }
        });

        await writeStorageLogSafely({
          level: "info",
          event: "indexeddb_load_success",
          message: "Loaded app data from IndexedDB.",
          details: { updatedAt: record.updatedAt || null, appVersion: record.appVersion || null }
        });

        if (previousVersion !== DATA_SCHEMA_VERSION) {
          await writeStorageLogSafely({
            level: "warning",
            event: "data_migration_success",
            message: `Upgraded saved app data from ${previousVersion} to ${DATA_SCHEMA_VERSION}.`,
            details: {
              previousVersion,
              newVersion: DATA_SCHEMA_VERSION,
              migratedAt: loadedAt,
              source: "indexedDB",
              actions: buildMigrationActions(previousVersion, "indexedDB"),
              warnings: []
            }
          });
        }

        return normalisedData;
      }
    } catch (error) {
      indexedDbError = error;
      console.error("Failed to load IndexedDB app data:", error);
      await writeStorageLogSafely({
        level: "error",
        event: "indexeddb_load_failed",
        message: error.message || "Failed to load app data from IndexedDB.",
        details: null
      });
    }
  }

  const legacyData = loadLegacyLocalStorageData();

  if (legacyData) {
    const migratedAt = new Date().toISOString();
    const previousVersion = readDataVersion(legacyData);
    const migratedData = normaliseAppData({
      ...legacyData,
      settings: {
        ...(legacyData.settings || {}),
        ...buildMigrationSettingsPatch(previousVersion, migratedAt),
        storageMode: "indexedDB",
        storagePrimary: isAppIndexedDbAvailable() ? "indexedDB" : "localStorage-fallback",
        migratedFromLocalStorageAt: legacyData.settings?.migratedFromLocalStorageAt || migratedAt,
        lastIndexedDbLoadAt: null,
        indexedDbLoadError: indexedDbError?.message || null,
        dataVersion: DATA_SCHEMA_VERSION,
        appVersion: APP_VERSION
      }
    });

    if (isAppIndexedDbAvailable()) {
      try {
        await preserveLegacyLocalStorageMigrationSnapshot(legacyData, migratedAt);
        await saveCurrentAppDataRecord(migratedData, {
          savedAt: migratedAt,
          appVersion: APP_VERSION,
          dataSchemaVersion: DATA_SCHEMA_VERSION,
          source: "localStorage-migration"
        });
        await writeStorageLogSafely({
          level: previousVersion === DATA_SCHEMA_VERSION ? "info" : "warning",
          event: "localstorage_migration_success",
          message: "Migrated legacy localStorage data into IndexedDB.",
          details: {
            previousVersion,
            newVersion: DATA_SCHEMA_VERSION,
            migratedAt,
            source: "localStorage",
            actions: buildMigrationActions(previousVersion, "localStorage"),
            warnings: []
          }
        });
        writeStorageMeta({
          storageMode: "indexedDB",
          migratedFromLocalStorageAt: migratedAt,
          lastSavedAt: migratedAt
        });
      } catch (error) {
        console.error("Failed to migrate localStorage data into IndexedDB:", error);
        await writeStorageLogSafely({
          level: "error",
          event: "localstorage_migration_failed",
          message: error.message || "Failed to migrate legacy localStorage data into IndexedDB.",
          details: {
            previousVersion,
            newVersion: DATA_SCHEMA_VERSION,
            migratedAt,
            source: "localStorage",
            actions: buildMigrationActions(previousVersion, "localStorage"),
            success: false,
            warnings: [error.message || "Failed to migrate legacy localStorage data into IndexedDB."]
          }
        });
      }
    }

    return migratedData;
  }

  if (indexedDbError) {
    writeStorageMeta({
      storageMode: "indexedDB",
      lastLoadError: indexedDbError.message || "IndexedDB load failed",
      lastLoadErrorAt: new Date().toISOString()
    });
    throw createStorageLoadFailure(indexedDbError);
  }

  return null;
}

let saveQueue = Promise.resolve();
let lastSaveError = null;
let lastSaveAt = null;

export function saveAppData(data) {
  const safeData = normaliseAppData(data);
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => saveAppDataAsync(safeData));
  return saveQueue;
}

export async function saveAppDataAsync(data) {
  const safeData = normaliseAppData({
    ...data,
    settings: {
      ...(data.settings || {}),
      storageMode: "indexedDB",
      storagePrimary: isAppIndexedDbAvailable() ? "indexedDB" : "localStorage-fallback",
      dataVersion: DATA_SCHEMA_VERSION,
      appVersion: APP_VERSION
    }
  });
  const savedAt = new Date().toISOString();

  if (isAppIndexedDbAvailable()) {
    try {
      await saveCurrentAppDataRecord(safeData, {
        savedAt,
        appVersion: APP_VERSION,
        dataSchemaVersion: DATA_SCHEMA_VERSION,
        source: "app-save"
      });
      lastSaveAt = savedAt;
      lastSaveError = null;
      writeStorageMeta({ storageMode: "indexedDB", lastSavedAt: savedAt, lastSaveError: null });
      removeLegacyLiveDataAfterIndexedDbSave();
      writeLocalStorageRecoveryCopy(safeData);
      return { ok: true, storageMode: "indexedDB", savedAt };
    } catch (error) {
      lastSaveError = error;
      console.error("Failed to save app data to IndexedDB:", error);
      await writeStorageLogSafely({
        level: "error",
        event: "indexeddb_save_failed",
        message: error.message || "Failed to save app data to IndexedDB.",
        details: { savedAt }
      });
      writeStorageMeta({
        storageMode: "indexedDB",
        lastSaveError: error.message || "IndexedDB save failed",
        lastSaveErrorAt: savedAt
      });
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeData));
    lastSaveAt = savedAt;
    lastSaveError = null;
    await writeStorageLogSafely({
      level: "warning",
      event: "localstorage_fallback_save",
      message: "Saved app data to localStorage fallback because IndexedDB was unavailable or failed.",
      details: { savedAt }
    });
    writeStorageMeta({ storageMode: "localStorage-fallback", lastSavedAt: savedAt, lastSaveError: null });
    return { ok: true, storageMode: "localStorage-fallback", savedAt };
  } catch (error) {
    lastSaveError = error;
    console.error("Failed to save app data to fallback localStorage:", error);
    await writeStorageLogSafely({
      level: "error",
      event: "all_storage_save_failed",
      message: error.message || "All browser storage saves failed.",
      details: { savedAt }
    });
    writeStorageMeta({
      storageMode: "failed",
      lastSaveError: error.message || "All browser storage saves failed",
      lastSaveErrorAt: savedAt
    });
    return { ok: false, storageMode: "failed", savedAt, error };
  }
}

export async function clearAppData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_META_KEY);

  try {
    await clearCurrentAppDataRecord();
    await clearAppDataSnapshots();
    await writeStorageLogSafely({ level: "warning", event: "app_data_cleared", message: "Cleared current app data and snapshots.", details: null });
  } catch (error) {
    console.error("Failed to clear IndexedDB app data:", error);
  }
}

export async function enablePersistentBrowserStorage() {
  return requestPersistentBrowserStorage();
}

export async function checkPersistentBrowserStorage() {
  return isPersistentBrowserStorageGranted();
}

export async function exportJsonBackup(data, exportedAt = new Date().toISOString(), forcedFilename = null) {
  const filename = forcedFilename || buildBackupFilename(exportedAt);
  const payload = createBackupPayload(data, exportedAt);

  try {
    payload.receiptStorage = await exportReceiptBackupRecords();
    payload.counts.indexedDbReceipts = payload.receiptStorage.count || 0;
  } catch (error) {
    payload.receiptStorage = {
      storageType: "indexedDB",
      exportError: error.message || "Receipt storage could not be exported.",
      count: 0,
      receipts: []
    };
  }

  const result = await saveJsonPayload(payload, filename, "Guinness & Holley Budgeting backup");
  return { ...result, exportedAt };
}

export async function exportRawSavedData(exportedAt = new Date().toISOString()) {
  const rawText = localStorage.getItem(STORAGE_KEY) || "";
  const storageMetaText = localStorage.getItem(STORAGE_META_KEY) || "";
  let parsedData = null;
  let parseError = null;
  let parsedStorageMeta = null;

  try {
    parsedData = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    parseError = error.message || "Could not parse raw localStorage data.";
  }

  try {
    parsedStorageMeta = storageMetaText ? JSON.parse(storageMetaText) : null;
  } catch (error) {
    parsedStorageMeta = { parseError: error.message || "Could not parse storage metadata." };
  }

  const indexedDbRaw = await readIndexedDbRawExport();

  const filename = buildRawDataFilename(exportedAt);
  const payload = {
    appName: "Guinness & Holley Budgeting",
    exportType: "emergency-raw-browser-storage",
    appVersion: APP_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    exportedAt,
    primaryStorage: "indexedDB",
    localStorage: {
      storageKey: STORAGE_KEY,
      metaKey: STORAGE_META_KEY,
      parseError,
      rawText,
      parsedData,
      storageMetaText,
      parsedStorageMeta
    },
    indexedDb: indexedDbRaw
  };

  const result = await saveJsonPayload(payload, filename, "Guinness & Holley Budgeting raw saved data");
  return { ...result, exportedAt };
}

export function createBackupPayload(data, exportedAt = new Date().toISOString()) {
  const safeData = normaliseAppData(data);

  return {
    appName: "Guinness & Holley Budgeting",
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION,
    exportedAt,
    source: "indexeddb-local-browser-storage",
    profile: {
      localProfileId: safeData.profile.localProfileId,
      displayName: safeData.profile.displayName,
      profileName: safeData.profile.profileName,
      profileType: safeData.profile.profileType,
      syncEnabled: safeData.profile.syncEnabled
    },
    counts: getBackupCounts(safeData),
    data: safeData,
    receiptStorage: null
  };
}

export async function parseBackupFile(file) {
  const fileCheck = isSupportedBackupFile(file);
  if (!fileCheck.ok) {
    throw new Error(fileCheck.message);
  }

  const rawText = await file.text();
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error("This is not a valid JSON file. Choose a Guinness & Holley Budgeting backup file.");
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

  if (isWrappedBackup && parsed.appName && parsed.appName !== "Guinness & Holley Budgeting") {
    warnings.push("This backup does not identify itself as a Guinness & Holley Budgeting backup.");
  }

  const restoredData = normaliseAppData(candidateData);

  return {
    filename,
    warnings,
    meta: {
      appName: parsed.appName || "Guinness & Holley Budgeting",
      backupFormatVersion: parsed.backupFormatVersion || "legacy/raw-data",
      appVersion: parsed.appVersion || parsed?.settings?.appVersion || "unknown",
      dataSchemaVersion: parsed.dataSchemaVersion || parsed?.settings?.dataVersion || "unknown",
      exportedAt: parsed.exportedAt || parsed?.settings?.lastBackupAt || null,
      source: parsed.source || "unknown"
    },
    profile: restoredData.profile,
    counts: {
      ...getBackupCounts(restoredData),
      indexedDbReceipts: Array.isArray(parsed.receiptStorage?.receipts) ? parsed.receiptStorage.receipts.length : 0
    },
    data: restoredData,
    receiptStorage: parsed.receiptStorage || null
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
      hasUnbackedChanges: false,
      changesSinceBackup: 0,
      lastDataChangedAt: null,
      lastBackupReminderAt: exportedAt,
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
      hasUnbackedChanges: true,
      changesSinceBackup: Number(safeData.settings?.changesSinceBackup || 0) + 1,
      lastDataChangedAt: restoredAt,
      lastMajorChangeAt: restoredAt,
      lastBackupReminderAt: null,
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


function normaliseCloudBackupConfig(value = {}) {
  const cloud = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    provider: cloud.provider || "supabase",
    mode: cloud.mode || "auto-cloud-backup",
    enabled: Boolean(cloud.enabled),
    requireLoginBeforeData: cloud.requireLoginBeforeData !== false,
    supabaseUrl: "",
    supabaseAnonKey: "",
    tableName: cloud.tableName || "gh_cloud_backups",
    cloudUserId: cloud.cloudUserId || null,
    cloudUserEmail: cloud.cloudUserEmail || "",
    lastSignedInAt: cloud.lastSignedInAt || null,
    lastCloudBackupAt: cloud.lastCloudBackupAt || null,
    lastCloudBackupId: cloud.lastCloudBackupId || null,
    lastCloudRestoreAt: cloud.lastCloudRestoreAt || null,
    lastCloudListAt: cloud.lastCloudListAt || null,
    lastCloudError: cloud.lastCloudError || null,
    cloudBackupNeeded: Boolean(cloud.cloudBackupNeeded),
    linkedLocalDataAt: cloud.linkedLocalDataAt || null,
    lastAutoCloudBackupAt: cloud.lastAutoCloudBackupAt || null,
    lastCloudConflictAt: cloud.lastCloudConflictAt || null,
    cloudConflict: cloud.cloudConflict || null,
    appSessionDays: Number(cloud.appSessionDays || 7),
    version: cloud.version || "1"
  };
}

export function isSupportedBackupFile(file) {
  if (!file) {
    return { ok: false, message: "Choose a JSON backup file first." };
  }

  const maxBytes = 25 * 1024 * 1024;
  if (Number(file.size || 0) > maxBytes) {
    return { ok: false, message: "This backup file is over 25 MB. Export emergency raw data first, then split or inspect the file before restoring." };
  }

  const name = String(file.name || "").toLowerCase();
  if (name && !name.endsWith(".json")) {
    return { ok: false, message: "Choose a .json backup file." };
  }

  return { ok: true, message: "" };
}

function mergeMissingDefaultCategories(categories, settings = {}) {
  const existing = Array.isArray(categories) ? categories : [];
  const existingIds = new Set(existing.map(category => category.id));
  const deletedDefaultIds = new Set(Array.isArray(settings.deletedDefaultCategoryIds) ? settings.deletedDefaultCategoryIds : []);
  const missingDefaults = defaultCategories.filter(category => !existingIds.has(category.id) && !deletedDefaultIds.has(category.id));
  return [...existing, ...missingDefaults];
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normaliseSavingsGoalRecord(goalRecord) {
  const goal = goalRecord && typeof goalRecord === "object" && !Array.isArray(goalRecord) ? goalRecord : {};
  return {
    ...goal,
    name: goal.name || "Savings goal",
    targetAmount: safeNumber(goal.targetAmount, 0),
    currentManualAmount: safeNumber(goal.currentManualAmount, 0),
    linkedAccountId: goal.linkedAccountId || null,
    targetDate: goal.targetDate || null,
    isActive: goal.isActive !== false && !goal.isArchived && !goal.archivedAt,
    isArchived: Boolean(goal.isArchived || goal.archivedAt || goal.isActive === false),
    archivedAt: goal.archivedAt || null
  };
}

function normaliseLoanRecord(loanRecord) {
  const loan = loanRecord && typeof loanRecord === "object" && !Array.isArray(loanRecord) ? loanRecord : {};
  const type = loan.type || "studentLoan";
  const baseLoan = {
    ...loan,
    type,
    name: loan.name || (type === "mortgage" ? "Mortgage" : "Loan"),
    originalAmount: safeNumber(loan.originalAmount, 0),
    currentBalance: safeNumber(loan.currentBalance, 0),
    balanceDate: loan.balanceDate || null,
    startDate: loan.startDate || null,
    status: loan.status || (loan.isActive === false || loan.archivedAt ? "archived" : "active"),
    archivedAt: loan.archivedAt || null
  };

  if (type === "mortgage") {
    return {
      ...baseLoan,
      mortgageDetails: {
        repaymentType: "repayment",
        termYears: 25,
        remainingTermMonths: 0,
        monthlyPayment: 0,
        paymentDay: 1,
        interestType: "fixed",
        currentRate: 0,
        fixedUntil: null,
        followOnRate: 0,
        plannedMonthlyOverpayment: 0,
        overpaymentAllowancePercent: 10,
        earlyRepaymentChargeApplies: false,
        propertyValue: 0,
        ...(loan.mortgageDetails && typeof loan.mortgageDetails === "object" && !Array.isArray(loan.mortgageDetails) ? loan.mortgageDetails : {})
      },
      studentLoanDetails: null
    };
  }

  if (type === "studentLoan") {
    return {
      ...baseLoan,
      studentLoanDetails: {
        planType: "plan2",
        repaymentStartDate: null,
        grossAnnualSalary: 0,
        payFrequency: "monthly",
        employmentType: "PAYE",
        salaryGrowthPercent: 0,
        manualAnnualInterestRate: null,
        ...(loan.studentLoanDetails && typeof loan.studentLoanDetails === "object" && !Array.isArray(loan.studentLoanDetails) ? loan.studentLoanDetails : {})
      },
      mortgageDetails: null
    };
  }

  return baseLoan;
}

// Legacy data stored a transfer as one record with fromAccountId/toAccountId,
// which merged two independently-real bank movements into a single balance
// term. That made a single-sided CSV match silently corrupt the untouched
// account's balance. This one-time migration splits every legacy transfer
// into two plain income/expense transactions (one per account), linked by
// transferLinkId, so each account's balance is only ever its own rows.
export function migrateTransferTransactions(transactions, importBatches) {
  const source = Array.isArray(transactions) ? transactions : [];
  if (!source.some(transaction => transaction && transaction.type === "transfer")) {
    return { transactions: source, importBatches: Array.isArray(importBatches) ? importBatches : [] };
  }

  const idReplacements = new Map();
  const nextTransactions = [];

  source.forEach(transaction => {
    if (!transaction || transaction.type !== "transfer") {
      if (transaction) nextTransactions.push(transaction);
      return;
    }

    const legs = splitLegacyTransferTransaction(transaction);
    if (legs.length > 0) {
      idReplacements.set(transaction.id, legs.map(leg => leg.id));
    }
    nextTransactions.push(...legs);
  });

  const nextImportBatches = (Array.isArray(importBatches) ? importBatches : []).map(batch => {
    if (!Array.isArray(batch?.transactionIds) || batch.transactionIds.length === 0) return batch;
    let changed = false;
    const nextIds = [];
    batch.transactionIds.forEach(id => {
      const replacement = idReplacements.get(id);
      if (replacement) {
        changed = true;
        nextIds.push(...replacement);
      } else {
        nextIds.push(id);
      }
    });
    return changed ? { ...batch, transactionIds: nextIds } : batch;
  });

  return { transactions: nextTransactions, importBatches: nextImportBatches };
}

function splitLegacyTransferTransaction(transaction) {
  const bankRows = Array.isArray(transaction.matchedBankRows) ? transaction.matchedBankRows : [];
  const isManualTransfer = bankRows.length === 0;
  const fromBankRows = bankRows.filter(row => row?.accountId === transaction.fromAccountId);
  const toBankRows = bankRows.filter(row => row?.accountId === transaction.toAccountId);

  const keepFromLeg = Boolean(transaction.fromAccountId) && (isManualTransfer || fromBankRows.length > 0);
  const keepToLeg = Boolean(transaction.toAccountId) && (isManualTransfer || toBankRows.length > 0);

  if (!keepFromLeg && !keepToLeg) return [];

  const fromId = transaction.id;
  const toId = keepFromLeg ? createId("txn") : transaction.id;

  const shared = {
    date: transaction.date,
    amount: Math.abs(Number(transaction.amount || 0)),
    title: transaction.title || "Transfer",
    isRecurring: false,
    recurringItemId: null,
    isExample: Boolean(transaction.isExample),
    status: transaction.status === "matched" ? "matched" : (isManualTransfer ? "manual" : "imported"),
    importSource: transaction.importSource || null,
    plannedDate: transaction.plannedDate || null,
    plannedAmount: transaction.plannedAmount ?? null,
    actualDate: transaction.actualDate || transaction.date,
    actualAmount: transaction.actualAmount ?? Math.abs(Number(transaction.amount || 0)),
    createdAt: transaction.createdAt || new Date().toISOString(),
    updatedAt: transaction.updatedAt || new Date().toISOString()
  };

  const fromLeg = keepFromLeg ? {
    ...shared,
    id: fromId,
    type: "expense",
    accountId: transaction.fromAccountId,
    categoryId: null,
    excludeFromBudget: false,
    note: transaction.note || "",
    matchedBankRows: fromBankRows,
    transferLinkId: keepToLeg ? toId : null
  } : null;

  const toLeg = keepToLeg ? {
    ...shared,
    id: toId,
    type: "income",
    accountId: transaction.toAccountId,
    categoryId: null,
    note: transaction.note || "",
    matchedBankRows: toBankRows,
    linkedSavingsGoalId: transaction.linkedSavingsGoalId || null,
    transferLinkId: keepFromLeg ? fromId : null
  } : null;

  return [fromLeg, toLeg].filter(Boolean);
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

  const baseSettings = base.settings && typeof base.settings === "object" && !Array.isArray(base.settings)
    ? base.settings
    : {};

  next.accounts = next.accounts.map(accountRecord => {
    const account = accountRecord && typeof accountRecord === "object" && !Array.isArray(accountRecord) ? accountRecord : {};
    return {
      ...account,
      name: account.name || "Account",
      type: account.type || "current",
      openingBalance: Number(account.openingBalance || 0),
      isActive: account.isActive !== false
    };
  });

  next.categories = mergeMissingDefaultCategories(next.categories, baseSettings).map(categoryRecord => {
    const category = categoryRecord && typeof categoryRecord === "object" && !Array.isArray(categoryRecord) ? categoryRecord : {};
    const type = category.type || "expense";
    return {
      ...category,
      name: category.name || "Category",
      type,
      group: category.group || (type === "income" ? "Income" : "Other"),
      isActive: category.isActive !== false && !category.isArchived && !category.archivedAt
    };
  });

  const migratedTransfers = migrateTransferTransactions(next.transactions, next.importBatches);
  next.transactions = migratedTransfers.transactions;
  next.importBatches = migratedTransfers.importBatches;

  next.savingsGoals = next.savingsGoals.map(normaliseSavingsGoalRecord);
  next.loans = next.loans.map(normaliseLoanRecord);
  next.houses = ensureHousesFromMortgageLoans({ ...next, houses: next.houses });
  next.housePeople = next.housePeople.map(normaliseHousePersonRecord).filter(item => item.houseId);
  next.houseContributions = next.houseContributions.map(normaliseHouseContributionRecord).filter(item => item.houseId);
  next.houseMembers = next.houseMembers.map(normaliseHouseMemberRecord).filter(item => item.houseId);
  next.houseInvites = next.houseInvites.map(normaliseHouseInviteRecord).filter(item => item.houseId);
  next.houseOwnershipSplits = next.houseOwnershipSplits.map(normaliseHouseOwnershipSplitRecord).filter(item => item.houseId);

  const profileSource = base.profile && typeof base.profile === "object" && !Array.isArray(base.profile)
    ? base.profile
    : {};
  const initialProfile = createDefaultProfile(profileSource, baseSettings);
  const normalisedProfiles = Array.isArray(base.profiles) && base.profiles.length > 0
    ? base.profiles.map(profileItem => createDefaultProfile(profileItem, baseSettings))
    : [initialProfile];
  const activeProfileId = base.activeProfileId
    || initialProfile.localProfileId
    || normalisedProfiles[0]?.localProfileId;
  const profile = normalisedProfiles.find(item => item.localProfileId === activeProfileId)
    || normalisedProfiles[0]
    || initialProfile;

  next.activeProfileId = profile.localProfileId;
  next.profile = profile;
  next.profiles = normalisedProfiles.some(item => item.localProfileId === profile.localProfileId)
    ? normalisedProfiles.map(item => item.localProfileId === profile.localProfileId ? profile : item)
    : [profile, ...normalisedProfiles];

  [
    "transactions",
    "accounts",
    "categories",
    "budgets",
    "recurringItems",
    "savingsGoals",
    "closedMonths",
    "accountAdjustments",
    "loans",
    "loanEvents",
    "houses",
    "housePeople",
    "houseContributions",
    "houseMembers",
    "houseInvites",
    "houseOwnershipSplits",
    "activityLog",
    "budgetTemplates",
    "plannedTransactions",
    "importBatches",
    "importRules",
    "transferRules",
    "externalAccountMappings",
    "csvColumnMappings"
  ].forEach(field => {
    next[field] = applyActiveProfileToRecords(next[field], next.activeProfileId);
  });

  next.settings = {
    ...baseSettings,
    currency: profile.currency || baseSettings.currency || "GBP",
    currencySymbol: profile.currencySymbol || baseSettings.currencySymbol || "£",
    monthMode: profile.monthMode || baseSettings.monthMode || "calendar",
    customMonthStartDay: Number(profile.customMonthStartDay || baseSettings.customMonthStartDay || 1),
    hasUnbackedChanges: Boolean(baseSettings.hasUnbackedChanges),
    changesSinceBackup: Number(baseSettings.changesSinceBackup || 0),
    lastDataChangedAt: baseSettings.lastDataChangedAt || null,
    lastMajorChangeAt: baseSettings.lastMajorChangeAt || null,
    lastBackupReminderAt: baseSettings.lastBackupReminderAt || null,
    themeMode: baseSettings.themeMode || (baseSettings.darkModeEnabled ? "dark" : "light"),
    darkModeEnabled: Boolean(baseSettings.darkModeEnabled || baseSettings.themeMode === "dark"),
    accentColor: baseSettings.accentColor || "#0b5d45",
    dashboardLayout: baseSettings.dashboardLayout || "full",
    largeExpenseThreshold: Number(baseSettings.largeExpenseThreshold || 200),
    budgetWarningThresholds: {
      greenMax: Number(baseSettings.budgetWarningThresholds?.greenMax ?? 75),
      orangeMax: Number(baseSettings.budgetWarningThresholds?.orangeMax ?? 100)
    },
    budgetAffordabilityThreshold: Number(baseSettings.budgetAffordabilityThreshold || 100),
    budgetAffordabilityWarningsEnabled: baseSettings.budgetAffordabilityWarningsEnabled !== false,
    billReminderDays: Number(baseSettings.billReminderDays ?? 7),
    futureSuggestions: Array.isArray(baseSettings.futureSuggestions) ? baseSettings.futureSuggestions : [],
    backupButtonFlashEnabled: baseSettings.backupButtonFlashEnabled !== false,
    backupBannerDismissedAt: baseSettings.backupBannerDismissedAt || null,
    storageMode: baseSettings.storageMode || "indexedDB",
    storagePrimary: baseSettings.storagePrimary || "indexedDB",
    migratedFromLocalStorageAt: baseSettings.migratedFromLocalStorageAt || null,
    lastIndexedDbLoadAt: baseSettings.lastIndexedDbLoadAt || null,
    indexedDbLoadError: baseSettings.indexedDbLoadError || null,
    persistentStorageRequestedAt: baseSettings.persistentStorageRequestedAt || null,
    persistentStorageGranted: Boolean(baseSettings.persistentStorageGranted),
    cloudBackup: normaliseCloudBackupConfig(baseSettings.cloudBackup),
    featureFlags: normaliseFeatureFlags(baseSettings.featureFlags),
    adminAuditLog: Array.isArray(baseSettings.adminAuditLog) ? baseSettings.adminAuditLog.slice(0, 50) : [],
    admin: baseSettings.admin && typeof baseSettings.admin === "object" && !Array.isArray(baseSettings.admin) ? baseSettings.admin : {},
    deletedDefaultCategoryIds: Array.isArray(baseSettings.deletedDefaultCategoryIds) ? baseSettings.deletedDefaultCategoryIds : [],
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
    loans: safeData.loans.length,
    loanEvents: safeData.loanEvents.length,
    houses: safeData.houses.length,
    housePeople: safeData.housePeople.length,
    houseContributions: safeData.houseContributions.length,
    houseMembers: safeData.houseMembers.length,
    houseInvites: safeData.houseInvites.length,
    houseOwnershipSplits: safeData.houseOwnershipSplits.length,
    activityLog: safeData.activityLog.length,
    budgetTemplates: safeData.budgetTemplates.length,
    plannedTransactions: safeData.plannedTransactions.length,
    linkedLoanTransactions: safeData.transactions.filter(transaction => Boolean(transaction.linkedLoanId)).length,
    linkedHouseTransactions: safeData.transactions.filter(transaction => Boolean(transaction.linkedHouseId)).length,
    importBatches: safeData.importBatches.length,
    importRules: safeData.importRules.length,
    transferRules: safeData.transferRules.length,
    externalAccountMappings: safeData.externalAccountMappings.length,
    csvColumnMappings: safeData.csvColumnMappings.length,
    receiptAttachments: safeData.transactions.filter(transaction => Boolean(transaction.receiptId)).length,
    indexedDbReceipts: 0,
    profiles: safeData.profiles.length
  };
}

export function updateLocalProfile(data, profilePatch = {}) {
  const safeData = normaliseAppData(data);
  const now = new Date().toISOString();
  const displayName = String(profilePatch.displayName || profilePatch.username || safeData.profile.displayName || "").trim();
  const updatedProfile = createDefaultProfile({
    ...safeData.profile,
    ...profilePatch,
    username: String(profilePatch.username || displayName || safeData.profile.username || "").trim(),
    displayName,
    updatedAt: now
  }, safeData.settings);

  return normaliseAppData({
    ...safeData,
    activeProfileId: updatedProfile.localProfileId,
    profile: updatedProfile,
    profiles: safeData.profiles.map(profileItem => (
      profileItem.localProfileId === updatedProfile.localProfileId ? updatedProfile : profileItem
    ))
  });
}

export function markAppDataChanged(data, options = {}) {
  const safeData = normaliseAppData(data);

  if (options.markDirty === false) {
    return safeData;
  }

  const now = options.changedAt || new Date().toISOString();
  const previousCount = Number(safeData.settings?.changesSinceBackup || 0);
  const reason = options.reason || safeData.settings?.lastChangeReason || "App data updated";
  const activityEntry = {
    id: `activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: options.activityType || reason.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "app_update",
    description: reason,
    area: options.area || inferActivityArea(reason),
    user: safeData.profile?.displayName || safeData.profile?.username || safeData.settings?.cloudBackup?.cloudUserEmail || "Local user",
    metadata: options.activityMetadata || {},
    createdAt: now
  };

  return normaliseAppData({
    ...safeData,
    activityLog: [activityEntry, ...(safeData.activityLog || [])].slice(0, 200),
    settings: {
      ...safeData.settings,
      hasUnbackedChanges: true,
      changesSinceBackup: previousCount + 1,
      lastDataChangedAt: now,
      lastMajorChangeAt: options.major ? now : safeData.settings?.lastMajorChangeAt || null,
      lastChangeReason: reason,
      cloudBackup: {
        ...(safeData.settings.cloudBackup || {}),
        cloudBackupNeeded: Boolean(safeData.settings.cloudBackup?.enabled || safeData.settings.cloudBackup?.linkedLocalDataAt)
      },
      dataVersion: DATA_SCHEMA_VERSION,
      appVersion: APP_VERSION
    }
  });
}

function inferActivityArea(reason = "") {
  const text = String(reason).toLowerCase();
  if (text.includes("transaction")) return "Transactions";
  if (text.includes("budget") || text.includes("category")) return "Budgets";
  if (text.includes("bill") || text.includes("recurring")) return "Bills";
  if (text.includes("saving")) return "Savings";
  if (text.includes("house") || text.includes("loan") || text.includes("mortgage")) return "Loans / House";
  if (text.includes("import")) return "Import";
  if (text.includes("backup") || text.includes("restore")) return "Backup";
  if (text.includes("admin")) return "Admin";
  if (text.includes("example")) return "Setup";
  return "App";
}

export function getBackupReminder(settingsOrLastBackupAt, now = new Date()) {
  const settings = settingsOrLastBackupAt && typeof settingsOrLastBackupAt === "object"
    ? settingsOrLastBackupAt
    : { lastBackupAt: settingsOrLastBackupAt };

  const changesSinceBackup = Number(settings.changesSinceBackup || 0);

  if (settings.hasUnbackedChanges || changesSinceBackup > 0) {
    const level = changesSinceBackup >= 25 ? "danger" : changesSinceBackup >= 5 ? "warning" : "notice";
    return {
      level,
      title: "Backup recommended",
      message: changesSinceBackup > 0
        ? `${changesSinceBackup} change(s) have been made since the last recorded backup.`
        : "There are changes that have not been backed up yet.",
      ageDays: null,
      hasUnbackedChanges: true,
      changesSinceBackup
    };
  }

  const lastBackupAt = settings.lastBackupAt;

  if (!lastBackupAt) {
    return {
      level: "warning",
      title: "No backup recorded",
      message: "Export a backup before adding a lot of real data.",
      ageDays: null,
      hasUnbackedChanges: false,
      changesSinceBackup
    };
  }

  const backupDate = new Date(lastBackupAt);
  if (Number.isNaN(backupDate.getTime())) {
    return {
      level: "warning",
      title: "Backup date unreadable",
      message: "Export a fresh backup so the app has a reliable recovery point.",
      ageDays: null,
      hasUnbackedChanges: false,
      changesSinceBackup
    };
  }

  const ageDays = Math.floor((now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays >= 14) {
    return {
      level: "danger",
      title: "Backup is more than 14 days old",
      message: "Export a fresh backup before making more changes.",
      ageDays,
      hasUnbackedChanges: false,
      changesSinceBackup
    };
  }

  if (ageDays >= 7) {
    return {
      level: "notice",
      title: "Backup is more than 7 days old",
      message: "Consider exporting a fresh backup soon.",
      ageDays,
      hasUnbackedChanges: false,
      changesSinceBackup
    };
  }

  return {
    level: "ok",
    title: "Backup looks recent",
    message: "Your last recorded backup is recent and there are no unbacked changes.",
    ageDays,
    hasUnbackedChanges: false,
    changesSinceBackup
  };
}

export function getStorageHealth(data, indexedDbStats = null) {
  const validation = validateAppData(data);
  const safeData = normaliseAppData(data);
  const storageMeta = readStorageMeta();
  const localStorageStatus = getLocalStorageStatus();
  const raw = localStorageStatus.available ? localStorage.getItem(STORAGE_KEY) || "" : "";
  const approxBytes = new Blob([JSON.stringify(safeData)]).size;
  const legacyLocalStorageBytes = new Blob([raw]).size;
  const browserEstimate = indexedDbStats?.estimate || null;
  const approxLimitBytes = browserEstimate?.quotaBytes || null;
  const storagePercent = browserEstimate?.usagePercent ?? null;
  const counts = getBackupCounts(safeData);
  const reminder = getBackupReminder(safeData.settings);
  const storageWarnings = [...validation.warnings];
  const storageErrors = [...validation.errors];

  if (!isAppIndexedDbAvailable()) {
    storageWarnings.push("IndexedDB is not available, so the app is using localStorage fallback. Export backups often.");
  }

  if (!localStorageStatus.available) {
    storageErrors.push(`localStorage is not available: ${localStorageStatus.error || "browser blocked access"}`);
  }

  if (indexedDbStats?.error) {
    storageWarnings.push(`IndexedDB status check failed: ${indexedDbStats.error}`);
  }

  if (storageMeta?.lastSaveError) {
    storageErrors.push(`Latest storage save reported an error: ${storageMeta.lastSaveError}`);
  }

  if (storagePercent !== null && storagePercent >= 80) {
    storageWarnings.push("Browser storage usage is getting high. Export a JSON backup before importing more data or adding receipts.");
  }

  return {
    ok: validation.ok && storageErrors.length === 0 && storagePercent !== null ? storagePercent < 95 : validation.ok && storageErrors.length === 0,
    status: validation.ok && storageErrors.length === 0 && (storagePercent === null || storagePercent < 80) ? "OK" : "Needs attention",
    storageType: indexedDbStats?.available === false ? "localStorage fallback" : "IndexedDB with localStorage recovery support",
    storageKey: "guinness-holley-budgeting-app/appData/current",
    legacyStorageKey: STORAGE_KEY,
    localStorageAvailable: localStorageStatus.available,
    localStorageError: localStorageStatus.error,
    approxBytes,
    approxKilobytes: Math.round((approxBytes / 1024) * 10) / 10,
    legacyLocalStorageBytes,
    legacyLocalStorageKilobytes: Math.round((legacyLocalStorageBytes / 1024) * 10) / 10,
    approxLimitBytes: approxLimitBytes || 0,
    approxLimitMegabytes: approxLimitBytes ? Math.round((approxLimitBytes / (1024 * 1024)) * 10) / 10 : null,
    storagePercent,
    indexedDb: indexedDbStats || null,
    lastSaveAt: lastSaveAt || storageMeta?.lastSavedAt || indexedDbStats?.currentRecordUpdatedAt || safeData.settings?.lastDataChangedAt || null,
    lastSaveError: lastSaveError?.message || storageMeta?.lastSaveError || null,
    lastMigrationRunAt: safeData.settings?.lastMigrationRunAt || safeData.settings?.migratedFromLocalStorageAt || null,
    lastMigrationPreviousVersion: safeData.settings?.lastMigrationPreviousVersion || null,
    lastMigrationNewVersion: safeData.settings?.lastMigrationNewVersion || null,
    lastMigrationWarnings: Array.isArray(safeData.settings?.lastMigrationWarnings) ? safeData.settings.lastMigrationWarnings : [],
    lastMigrationError: safeData.settings?.lastMigrationError || storageMeta?.lastMigrationError || null,
    errors: storageErrors,
    warnings: storageWarnings,
    counts,
    reminder
  };
}

export async function getStorageHealthAsync(data) {
  const indexedDbStats = await getIndexedDbStorageStats();
  return getStorageHealth(data, indexedDbStats);
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

  if ((backupCounts.loans || 0) < (currentCounts.loans || 0)) {
    warnings.push(`Backup has fewer loans than the current app (${backupCounts.loans || 0} vs ${currentCounts.loans || 0}). Restoring may remove loan tracking data.`);
  }

  if ((backupCounts.loanEvents || 0) < (currentCounts.loanEvents || 0)) {
    warnings.push(`Backup has fewer loan events than the current app (${backupCounts.loanEvents || 0} vs ${currentCounts.loanEvents || 0}).`);
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
  return `Guinness-Holley-Budgeting-Backup-${dateStamp}-${timeStamp}.json`;
}

export function buildRawDataFilename(exportedAt = new Date().toISOString()) {
  const dateStamp = exportedAt.slice(0, 10);
  const timeStamp = exportedAt.slice(11, 16).replace(":", "");
  return `Guinness-Holley-Budgeting-Raw-Storage-${dateStamp}-${timeStamp}.json`;
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


function loadLegacyLocalStorageData() {
  let raw = null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normaliseAppData(JSON.parse(raw)) : null;
  } catch (error) {
    console.error("Failed to load legacy localStorage app data:", error);
    preserveCorruptStorageSnapshot(raw, error);
    return null;
  }
}

function writeStorageMeta(patch = {}) {
  try {
    const existing = readStorageMeta();
    const next = {
      ...existing,
      ...patch,
      appVersion: APP_VERSION,
      dataSchemaVersion: DATA_SCHEMA_VERSION,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_META_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Could not write storage metadata:", error);
  }
}

function readStorageMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return { parseError: error.message || "Could not read storage metadata." };
  }
}

function getLocalStorageStatus() {
  try {
    const testKey = `${STORAGE_META_KEY}-availability-check`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return { available: true, error: null };
  } catch (error) {
    return { available: false, error: error.message || "localStorage access failed." };
  }
}

async function preserveLegacyLocalStorageMigrationSnapshot(data, migratedAt) {
  const existingSnapshot = localStorage.getItem(LEGACY_MIGRATION_SNAPSHOT_KEY);
  if (!existingSnapshot) {
    try {
      localStorage.setItem(LEGACY_MIGRATION_SNAPSHOT_KEY, JSON.stringify({
        capturedAt: migratedAt,
        appName: "Guinness & Holley Budgeting",
        appVersion: APP_VERSION,
        sourceStorageKey: STORAGE_KEY,
        data
      }));
    } catch (error) {
      console.warn("Could not keep localStorage migration snapshot:", error);
    }
  }

  try {
    await saveAppDataSnapshot(data, "pre-indexeddb-migration");
  } catch (error) {
    console.warn("Could not keep IndexedDB migration snapshot:", error);
  }
}

function removeLegacyLiveDataAfterIndexedDbSave() {
  try {
    if (!localStorage.getItem(LEGACY_MIGRATION_SNAPSHOT_KEY)) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localStorage.setItem(LEGACY_MIGRATION_SNAPSHOT_KEY, JSON.stringify({
          capturedAt: new Date().toISOString(),
          appName: "Guinness & Holley Budgeting",
          appVersion: APP_VERSION,
          sourceStorageKey: STORAGE_KEY,
          rawText: raw
        }));
      }
    }
  } catch (error) {
    console.warn("Could not preserve legacy localStorage snapshot:", error);
  }
}

function writeLocalStorageRecoveryCopy(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Could not write localStorage recovery copy:", error);
  }
}

function preserveCorruptStorageSnapshot(raw, error) {
  if (!raw) return;

  try {
    const key = `${CORRUPT_SNAPSHOT_PREFIX}-${new Date().toISOString()}`;
    const payload = {
      capturedAt: new Date().toISOString(),
      appName: "Guinness & Holley Budgeting",
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
