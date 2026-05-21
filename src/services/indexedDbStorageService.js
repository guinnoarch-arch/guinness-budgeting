const DB_NAME = "guinness-holley-budgeting-app";
const DB_VERSION = 2;
const APP_DATA_STORE = "appData";
const SNAPSHOT_STORE = "snapshots";
const STORAGE_LOG_STORE = "storageLogs";
const CURRENT_RECORD_ID = "current";
const MAX_SNAPSHOT_RECORDS = 5;
const MAX_STORAGE_LOG_RECORDS = 75;

function isBrowser() {
  return typeof window !== "undefined";
}

export function isAppIndexedDbAvailable() {
  return isBrowser() && typeof window.indexedDB !== "undefined";
}

function createStorageError(message, cause = null) {
  const error = new Error(message);
  if (cause) error.cause = cause;
  return error;
}

function requestToPromise(request, fallbackMessage = "IndexedDB request failed.") {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || createStorageError(fallbackMessage));
  });
}

function openAppDatabase() {
  if (!isAppIndexedDbAvailable()) {
    return Promise.reject(createStorageError("IndexedDB is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || createStorageError("Could not open app storage."));
    request.onblocked = () => reject(createStorageError("App storage upgrade is blocked by another open GH Budgeting tab."));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(APP_DATA_STORE)) {
        const store = db.createObjectStore(APP_DATA_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const snapshotStore = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        snapshotStore.createIndex("createdAt", "createdAt", { unique: false });
        snapshotStore.createIndex("reason", "reason", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORAGE_LOG_STORE)) {
        const logStore = db.createObjectStore(STORAGE_LOG_STORE, { keyPath: "id" });
        logStore.createIndex("createdAt", "createdAt", { unique: false });
        logStore.createIndex("level", "level", { unique: false });
        logStore.createIndex("event", "event", { unique: false });
      }
    };
  });
}

function withObjectStore(storeName, mode, callback) {
  return openAppDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let callbackResult;

    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };

    transaction.onerror = () => {
      const error = transaction.error || createStorageError("App storage transaction failed.");
      db.close();
      reject(error);
    };

    transaction.onabort = () => {
      const error = transaction.error || createStorageError("App storage transaction was aborted.");
      db.close();
      reject(error);
    };

    try {
      callbackResult = callback(store);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  }));
}

export async function readCurrentAppDataRecord() {
  return withObjectStore(APP_DATA_STORE, "readonly", store => requestToPromise(store.get(CURRENT_RECORD_ID), "Could not read app data."));
}

export async function saveCurrentAppDataRecord(data, meta = {}) {
  const now = meta.savedAt || new Date().toISOString();
  const record = {
    id: CURRENT_RECORD_ID,
    data,
    updatedAt: now,
    appVersion: meta.appVersion || data?.settings?.appVersion || null,
    dataSchemaVersion: meta.dataSchemaVersion || data?.settings?.dataVersion || null,
    source: meta.source || "app-save"
  };

  await withObjectStore(APP_DATA_STORE, "readwrite", store => store.put(record));
  return record;
}

export async function clearCurrentAppDataRecord() {
  await withObjectStore(APP_DATA_STORE, "readwrite", store => store.delete(CURRENT_RECORD_ID));
  return true;
}

export async function saveAppDataSnapshot(data, reason = "manual-snapshot") {
  const now = new Date().toISOString();
  const id = `snapshot_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const snapshot = {
    id,
    reason,
    createdAt: now,
    data
  };

  await withObjectStore(SNAPSHOT_STORE, "readwrite", store => store.put(snapshot));
  await pruneOldSnapshots();
  return snapshot;
}

async function pruneOldSnapshots() {
  const snapshots = await listAppDataSnapshots();
  const excess = snapshots
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(MAX_SNAPSHOT_RECORDS);

  if (!excess.length) return;

  await withObjectStore(SNAPSHOT_STORE, "readwrite", store => {
    excess.forEach(snapshot => store.delete(snapshot.id));
  });
}

export async function listAppDataSnapshots() {
  return withObjectStore(SNAPSHOT_STORE, "readonly", store => requestToPromise(store.getAll(), "Could not list app data snapshots."));
}

export async function clearAppDataSnapshots() {
  await withObjectStore(SNAPSHOT_STORE, "readwrite", store => store.clear());
  return true;
}

export async function addStorageLog(entry = {}) {
  if (!isAppIndexedDbAvailable()) return null;

  const now = entry.createdAt || new Date().toISOString();
  const log = {
    id: entry.id || `storage_log_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    level: entry.level || "info",
    event: entry.event || "storage_event",
    message: entry.message || "Storage event recorded.",
    details: entry.details || null
  };

  try {
    await withObjectStore(STORAGE_LOG_STORE, "readwrite", store => store.put(log));
    await pruneOldStorageLogs();
    return log;
  } catch (error) {
    console.warn("Could not write storage log:", error);
    return null;
  }
}

async function pruneOldStorageLogs() {
  const logs = await listStorageLogs({ limit: 1000 });
  const excess = logs
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(MAX_STORAGE_LOG_RECORDS);

  if (!excess.length) return;

  await withObjectStore(STORAGE_LOG_STORE, "readwrite", store => {
    excess.forEach(log => store.delete(log.id));
  });
}

export async function listStorageLogs(options = {}) {
  const limit = Number(options.limit || MAX_STORAGE_LOG_RECORDS);
  const logs = await withObjectStore(STORAGE_LOG_STORE, "readonly", store => requestToPromise(store.getAll(), "Could not list storage logs."));
  return (logs || [])
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit);
}

export async function clearStorageLogs() {
  await withObjectStore(STORAGE_LOG_STORE, "readwrite", store => store.clear());
  return true;
}

export async function readIndexedDbRawExport() {
  if (!isAppIndexedDbAvailable()) {
    return {
      available: false,
      error: "IndexedDB is not available in this browser.",
      currentRecord: null,
      snapshots: [],
      storageLogs: []
    };
  }

  try {
    const [currentRecord, snapshots, storageLogs] = await Promise.all([
      readCurrentAppDataRecord(),
      listAppDataSnapshots(),
      listStorageLogs({ limit: 75 })
    ]);

    return {
      available: true,
      databaseName: DB_NAME,
      databaseVersion: DB_VERSION,
      currentRecord: currentRecord || null,
      snapshots: snapshots || [],
      storageLogs: storageLogs || []
    };
  } catch (error) {
    return {
      available: true,
      databaseName: DB_NAME,
      databaseVersion: DB_VERSION,
      error: error.message || "Could not read IndexedDB app storage.",
      currentRecord: null,
      snapshots: [],
      storageLogs: []
    };
  }
}

export async function getIndexedDbStorageStats() {
  const stats = {
    available: isAppIndexedDbAvailable(),
    databaseName: DB_NAME,
    databaseVersion: DB_VERSION,
    currentRecordExists: false,
    currentRecordUpdatedAt: null,
    snapshotCount: 0,
    storageLogCount: 0,
    latestStorageLogAt: null,
    estimate: null,
    error: null
  };

  if (!stats.available) return stats;

  try {
    const [record, snapshots, storageLogs] = await Promise.all([
      readCurrentAppDataRecord(),
      listAppDataSnapshots(),
      listStorageLogs({ limit: 75 })
    ]);

    stats.currentRecordExists = Boolean(record?.data);
    stats.currentRecordUpdatedAt = record?.updatedAt || null;
    stats.snapshotCount = Array.isArray(snapshots) ? snapshots.length : 0;
    stats.storageLogCount = Array.isArray(storageLogs) ? storageLogs.length : 0;
    stats.latestStorageLogAt = Array.isArray(storageLogs) && storageLogs.length > 0 ? storageLogs[0].createdAt : null;

    if (navigator?.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      stats.estimate = {
        usageBytes: Number(estimate.usage || 0),
        quotaBytes: Number(estimate.quota || 0),
        usageMegabytes: Math.round((Number(estimate.usage || 0) / (1024 * 1024)) * 100) / 100,
        quotaMegabytes: Math.round((Number(estimate.quota || 0) / (1024 * 1024)) * 100) / 100,
        usagePercent: estimate.quota ? Math.round((Number(estimate.usage || 0) / Number(estimate.quota)) * 1000) / 10 : null
      };
    }
  } catch (error) {
    stats.error = error.message || "Could not read IndexedDB storage stats.";
  }

  return stats;
}

export async function requestPersistentBrowserStorage() {
  if (!navigator?.storage?.persist) {
    return { supported: false, persisted: false, message: "Persistent browser storage is not supported here." };
  }

  try {
    const persisted = await navigator.storage.persist();
    return {
      supported: true,
      persisted,
      message: persisted
        ? "Browser granted persistent storage for this site."
        : "Browser did not grant persistent storage. Keep exporting JSON backups."
    };
  } catch (error) {
    return {
      supported: true,
      persisted: false,
      message: error.message || "Persistent storage request failed."
    };
  }
}

export async function isPersistentBrowserStorageGranted() {
  if (!navigator?.storage?.persisted) {
    return { supported: false, persisted: false };
  }

  try {
    return { supported: true, persisted: await navigator.storage.persisted() };
  } catch (error) {
    return { supported: true, persisted: false, error: error.message || "Could not check persistent storage state." };
  }
}
