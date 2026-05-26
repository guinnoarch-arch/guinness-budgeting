import { getBackupCounts, normaliseAppData } from "./storageService.js";

const MERGE_COLLECTIONS = [
  "transactions",
  "accounts",
  "categories",
  "budgets",
  "recurringItems",
  "savingsGoals",
  "closedMonths",
  "importRules",
  "transferRules",
  "externalAccountMappings",
  "csvColumnMappings",
  "loans",
  "loanEvents"
];

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildDataFingerprint(data) {
  const safeData = normaliseAppData(data);
  const counts = getBackupCounts(safeData);
  const basis = {
    dataVersion: safeData.settings?.dataVersion || safeData.settings?.appVersion || "unknown",
    updatedAt: safeData.settings?.lastDataChangedAt || null,
    lastBackupAt: safeData.settings?.lastBackupAt || null,
    counts
  };
  let hash = 0;
  const text = stableStringify({
    settings: {
      dataVersion: safeData.settings?.dataVersion,
      lastDataChangedAt: safeData.settings?.lastDataChangedAt,
      lastBackupAt: safeData.settings?.lastBackupAt
    },
    counts,
    transactions: safeData.transactions,
    accounts: safeData.accounts,
    categories: safeData.categories,
    savingsGoals: safeData.savingsGoals
  });
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return { ...basis, checksum: Math.abs(hash).toString(16) };
}

function getRecordUpdatedAt(record) {
  const time = new Date(record?.updatedAt || record?.modifiedAt || record?.createdAt || record?.date || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function recordsMatch(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function mergeCollectionById(localRecords = [], cloudRecords = []) {
  const localById = new Map(localRecords.filter(item => item?.id).map(item => [item.id, item]));
  const cloudById = new Map(cloudRecords.filter(item => item?.id).map(item => [item.id, item]));
  const merged = [];
  const conflicts = [];
  const summary = { keptLocal: 0, keptCloud: 0, merged: 0, skipped: 0 };

  const ids = new Set([...localById.keys(), ...cloudById.keys()]);
  ids.forEach(id => {
    const localRecord = localById.get(id);
    const cloudRecord = cloudById.get(id);
    if (localRecord && !cloudRecord) {
      merged.push(localRecord);
      summary.keptLocal += 1;
      return;
    }
    if (!localRecord && cloudRecord) {
      merged.push(cloudRecord);
      summary.keptCloud += 1;
      return;
    }
    if (recordsMatch(localRecord, cloudRecord)) {
      merged.push(localRecord);
      summary.merged += 1;
      return;
    }

    const localUpdated = getRecordUpdatedAt(localRecord);
    const cloudUpdated = getRecordUpdatedAt(cloudRecord);
    if (localUpdated && cloudUpdated && localUpdated !== cloudUpdated) {
      merged.push(localUpdated > cloudUpdated ? localRecord : cloudRecord);
      if (localUpdated > cloudUpdated) summary.keptLocal += 1;
      else summary.keptCloud += 1;
      conflicts.push({ id, resolution: localUpdated > cloudUpdated ? "local-newer" : "cloud-newer", localRecord, cloudRecord });
      return;
    }

    merged.push(localRecord);
    summary.keptLocal += 1;
    conflicts.push({ id, resolution: "needs-review-local-default", localRecord, cloudRecord });
  });

  localRecords.filter(item => !item?.id).forEach(item => {
    merged.push(item);
    summary.keptLocal += 1;
  });
  cloudRecords.filter(item => !item?.id).forEach(item => {
    merged.push(item);
    summary.keptCloud += 1;
  });

  return { merged, conflicts, summary };
}

function textSimilarity(left, right) {
  const leftWords = new Set(String(left || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const rightWords = new Set(String(right || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  if (!leftWords.size || !rightWords.size) return 0;
  let shared = 0;
  leftWords.forEach(word => {
    if (rightWords.has(word)) shared += 1;
  });
  return shared / Math.max(leftWords.size, rightWords.size);
}

export function findSimilarTransactions(localTransactions = [], cloudTransactions = []) {
  const warnings = [];
  localTransactions.forEach(localTransaction => {
    cloudTransactions.forEach(cloudTransaction => {
      if (localTransaction?.id && cloudTransaction?.id && localTransaction.id === cloudTransaction.id) return;
      const amountDelta = Math.abs(Number(localTransaction?.amount || 0) - Number(cloudTransaction?.amount || 0));
      const dateDeltaDays = Math.abs(new Date(localTransaction?.date || 0).getTime() - new Date(cloudTransaction?.date || 0).getTime()) / 86400000;
      const titleScore = textSimilarity(localTransaction?.title || localTransaction?.description || localTransaction?.notes, cloudTransaction?.title || cloudTransaction?.description || cloudTransaction?.notes);
      const sameType = (localTransaction?.type || "") === (cloudTransaction?.type || "");
      const sameAccount = localTransaction?.accountId && localTransaction.accountId === cloudTransaction?.accountId;
      const sameCategory = localTransaction?.categoryId && localTransaction.categoryId === cloudTransaction?.categoryId;
      const sameImportRef = localTransaction?.importReference && localTransaction.importReference === cloudTransaction?.importReference;
      const looksSimilar = amountDelta <= 0.01 && dateDeltaDays <= 3 && sameType && (sameAccount || sameCategory || sameImportRef || titleScore >= 0.5);
      if (looksSimilar) {
        warnings.push({
          id: `${localTransaction?.id || "local"}-${cloudTransaction?.id || "cloud"}`,
          localTransaction,
          cloudTransaction,
          reasons: [
            amountDelta <= 0.01 ? "same amount" : null,
            dateDeltaDays <= 3 ? "date within 3 days" : null,
            sameType ? "same type" : null,
            sameAccount ? "same account" : null,
            sameCategory ? "same category" : null,
            sameImportRef ? "same import reference" : null,
            titleScore >= 0.5 ? "similar title/notes" : null
          ].filter(Boolean)
        });
      }
    });
  });
  return warnings.slice(0, 50);
}

export function buildMergeReview(localData, cloudData) {
  const local = normaliseAppData(localData);
  const cloud = normaliseAppData(cloudData);
  const mergedData = { ...local };
  const collectionSummaries = {};
  const conflicts = {};
  let totals = { keptLocal: 0, keptCloud: 0, merged: 0, skipped: 0 };

  MERGE_COLLECTIONS.forEach(collection => {
    const result = mergeCollectionById(local[collection] || [], cloud[collection] || []);
    mergedData[collection] = result.merged;
    collectionSummaries[collection] = result.summary;
    conflicts[collection] = result.conflicts;
    totals = {
      keptLocal: totals.keptLocal + result.summary.keptLocal,
      keptCloud: totals.keptCloud + result.summary.keptCloud,
      merged: totals.merged + result.summary.merged,
      skipped: totals.skipped + result.summary.skipped
    };
  });

  return {
    localFingerprint: buildDataFingerprint(local),
    cloudFingerprint: buildDataFingerprint(cloud),
    collectionSummaries,
    conflicts,
    possibleDuplicateTransactions: findSimilarTransactions(local.transactions, cloud.transactions),
    mergedData: normaliseAppData({
      ...mergedData,
      settings: {
        ...(mergedData.settings || {}),
        lastMergePreviewAt: new Date().toISOString()
      }
    }),
    totals
  };
}
