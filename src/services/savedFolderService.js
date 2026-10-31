import { createId } from "../utils/ids.js";

// Saved transaction folders: a filing system for transactions. A folder holds a
// list of transaction ids, and one transaction can sit in any number of folders.
// Membership lives on the folder, so the transaction itself is never changed.

export function getSavedFolders(data) {
  return Array.isArray(data?.savedFolders) ? data.savedFolders : [];
}

export function cleanFolderName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function findFolderByName(data, name) {
  const wanted = cleanFolderName(name).toLowerCase();
  if (!wanted) return null;
  return getSavedFolders(data).find(folder => folder.name.toLowerCase() === wanted) || null;
}

export function getFoldersForTransaction(data, transactionId) {
  return getSavedFolders(data).filter(folder => (folder.transactionIds || []).includes(transactionId));
}

// Folder names per transaction id, built once so a long table doesn't search
// every folder on every row.
export function buildFolderLookup(data) {
  const lookup = new Map();
  getSavedFolders(data).forEach(folder => {
    (folder.transactionIds || []).forEach(transactionId => {
      if (!lookup.has(transactionId)) lookup.set(transactionId, []);
      lookup.get(transactionId).push(folder);
    });
  });
  return lookup;
}

// Returns { data, folder }. If a folder with this name already exists, that one
// is returned instead of a duplicate.
export function createFolder(data, name) {
  const cleaned = cleanFolderName(name);
  if (!cleaned) return { data, folder: null };
  const existing = findFolderByName(data, cleaned);
  if (existing) return { data, folder: existing };

  const now = new Date().toISOString();
  const folder = {
    id: createId("folder"),
    name: cleaned,
    transactionIds: [],
    createdAt: now,
    updatedAt: now
  };
  return { data: { ...data, savedFolders: [...getSavedFolders(data), folder] }, folder };
}

export function renameFolder(data, folderId, name) {
  const cleaned = cleanFolderName(name);
  if (!cleaned) return data;
  const clash = findFolderByName(data, cleaned);
  if (clash && clash.id !== folderId) return data;
  return mapFolder(data, folderId, folder => ({ ...folder, name: cleaned }));
}

export function deleteFolder(data, folderId) {
  return { ...data, savedFolders: getSavedFolders(data).filter(folder => folder.id !== folderId) };
}

// Replace a folder's whole list of transactions (used by "Add transactions").
export function setFolderTransactions(data, folderId, transactionIds) {
  return mapFolder(data, folderId, folder => ({ ...folder, transactionIds: [...new Set(transactionIds)] }));
}

export function removeTransactionFromFolder(data, folderId, transactionId) {
  return mapFolder(data, folderId, folder => ({
    ...folder,
    transactionIds: (folder.transactionIds || []).filter(id => id !== transactionId)
  }));
}

// Put one transaction in exactly these folders (used by the transaction form).
// newFolderName creates one more folder on the spot.
export function setTransactionFolders(data, transactionId, folderIds, newFolderName = "") {
  let next = data;
  const wanted = new Set(folderIds);

  if (cleanFolderName(newFolderName)) {
    const created = createFolder(next, newFolderName);
    next = created.data;
    if (created.folder) wanted.add(created.folder.id);
  }

  const now = new Date().toISOString();
  let changed = next !== data;
  const savedFolders = getSavedFolders(next).map(folder => {
    const has = (folder.transactionIds || []).includes(transactionId);
    const shouldHave = wanted.has(folder.id);
    if (has === shouldHave) return folder;
    changed = true;
    return {
      ...folder,
      transactionIds: shouldHave
        ? [...(folder.transactionIds || []), transactionId]
        : (folder.transactionIds || []).filter(id => id !== transactionId),
      updatedAt: now
    };
  });

  return changed ? { ...next, savedFolders } : data;
}

// Used when a transaction is deleted so no folder keeps a dead id.
export function removeTransactionFromAllFolders(data, transactionId) {
  const folders = getSavedFolders(data);
  if (!folders.some(folder => (folder.transactionIds || []).includes(transactionId))) return data;
  const now = new Date().toISOString();
  return {
    ...data,
    savedFolders: folders.map(folder => (folder.transactionIds || []).includes(transactionId)
      ? { ...folder, transactionIds: folder.transactionIds.filter(id => id !== transactionId), updatedAt: now }
      : folder)
  };
}

function mapFolder(data, folderId, change) {
  const now = new Date().toISOString();
  return {
    ...data,
    savedFolders: getSavedFolders(data).map(folder => folder.id === folderId ? { ...change(folder), updatedAt: now } : folder)
  };
}
