const DB_NAME = "guinness-holley-budgeting-receipts";
const DB_VERSION = 1;
const STORE_NAME = "receipts";
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openReceiptDb() {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error("Could not open receipt storage."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("transactionId", "transactionId", { unique: false });
        store.createIndex("uploadedAt", "uploadedAt", { unique: false });
      }
    };
  });
}

function withReceiptStore(mode, callback) {
  return openReceiptDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let callbackResult;

    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };
    transaction.onerror = () => {
      const error = transaction.error || new Error("Receipt storage transaction failed.");
      db.close();
      reject(error);
    };

    callbackResult = callback(store);
  }));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Receipt storage request failed."));
  });
}

function createReceiptId(transactionId) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `receipt_${crypto.randomUUID()}`;
  }
  return `receipt_${transactionId}_${Date.now().toString(36)}`;
}

function validateReceiptFile(file) {
  if (!file) throw new Error("Choose a receipt file first.");
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt file is too large. Use a file under 10 MB.");
  }

  const allowed = file.type.startsWith("image/") || file.type === "application/pdf";
  if (!allowed) {
    throw new Error("Receipts must be an image or PDF file.");
  }
}

export async function saveTransactionReceipt(transactionId, file, existingReceiptId = null) {
  validateReceiptFile(file);

  const now = new Date().toISOString();
  const receiptId = existingReceiptId || createReceiptId(transactionId);
  const record = {
    id: receiptId,
    transactionId,
    fileName: file.name || "receipt",
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size || 0,
    uploadedAt: now,
    blob: file
  };

  await withReceiptStore("readwrite", store => store.put(record));

  return {
    receiptId,
    receiptFileName: record.fileName,
    receiptMimeType: record.mimeType,
    receiptSizeBytes: record.sizeBytes,
    receiptUploadedAt: record.uploadedAt
  };
}

export async function getStoredReceipt(receiptId) {
  if (!receiptId) return null;
  return withReceiptStore("readonly", store => requestToPromise(store.get(receiptId)));
}

export async function deleteStoredReceipt(receiptId) {
  if (!receiptId) return false;
  await withReceiptStore("readwrite", store => store.delete(receiptId));
  return true;
}

export async function listStoredReceipts() {
  return withReceiptStore("readonly", store => requestToPromise(store.getAll()));
}

export async function clearAllStoredReceipts() {
  await withReceiptStore("readwrite", store => store.clear());
  return true;
}

export async function getReceiptStorageStats() {
  if (!isIndexedDbAvailable()) {
    return {
      available: false,
      count: 0,
      totalBytes: 0,
      totalKilobytes: 0,
      totalMegabytes: 0,
      lastUploadedAt: null
    };
  }

  try {
    const records = await listStoredReceipts();
    const totalBytes = records.reduce((sum, record) => sum + Number(record.sizeBytes || record.blob?.size || 0), 0);
    const lastUploadedAt = records
      .map(record => record.uploadedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    return {
      available: true,
      count: records.length,
      totalBytes,
      totalKilobytes: Math.round((totalBytes / 1024) * 10) / 10,
      totalMegabytes: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      lastUploadedAt
    };
  } catch (error) {
    return {
      available: true,
      error: error.message || "Could not read receipt storage stats.",
      count: 0,
      totalBytes: 0,
      totalKilobytes: 0,
      totalMegabytes: 0,
      lastUploadedAt: null
    };
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read receipt file."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64Data] = String(dataUrl || "").split(",");
  const mimeMatch = header.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  const binary = atob(base64Data || "");
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export async function exportReceiptBackupRecords() {
  const records = await listStoredReceipts();
  const exportedReceipts = [];

  for (const record of records) {
    if (!record.blob) continue;
    exportedReceipts.push({
      id: record.id,
      transactionId: record.transactionId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes || record.blob.size || 0,
      uploadedAt: record.uploadedAt,
      dataUrl: await blobToDataUrl(record.blob)
    });
  }

  const totalBytes = exportedReceipts.reduce((sum, record) => sum + Number(record.sizeBytes || 0), 0);

  return {
    storageType: "indexedDB",
    exportedAt: new Date().toISOString(),
    count: exportedReceipts.length,
    totalBytes,
    receipts: exportedReceipts
  };
}

export async function restoreReceiptBackupRecords(receiptStorage) {
  const receipts = Array.isArray(receiptStorage?.receipts) ? receiptStorage.receipts : [];
  await clearAllStoredReceipts();

  for (const item of receipts) {
    if (!item.id || !item.dataUrl) continue;
    const blob = dataUrlToBlob(item.dataUrl);
    const record = {
      id: item.id,
      transactionId: item.transactionId,
      fileName: item.fileName || "receipt",
      mimeType: item.mimeType || blob.type || "application/octet-stream",
      sizeBytes: Number(item.sizeBytes || blob.size || 0),
      uploadedAt: item.uploadedAt || new Date().toISOString(),
      blob
    };
    await withReceiptStore("readwrite", store => store.put(record));
  }

  return { restoredReceipts: receipts.length };
}

export { MAX_RECEIPT_BYTES };
