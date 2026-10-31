import { getInitialAppData } from "../data/exampleData.js";
import { clearAppData } from "./storageService.js";
import { clearAllStoredReceipts } from "./receiptStorageService.js";
import { logWarning } from "../utils/logger.js";

// Keeps one account's budget from leaking into another on a shared device.
//
// The budget is stored in the browser, and it records which cloud account it
// belongs to (settings.cloudBackup.cloudUserId). If someone signs in as a
// DIFFERENT account, the stored budget is not theirs: it is wiped from this
// device and they start from a fresh copy, which then opens their own cloud
// backup. Signing back in as the original account does the same in reverse.

export function getLocalDataOwnerId(appData) {
  return appData?.settings?.cloudBackup?.cloudUserId || null;
}

// True when the budget stored on this device belongs to someone other than
// the account that has just signed in.
export function isDifferentAccountData(appData, signedInUserId) {
  const ownerId = getLocalDataOwnerId(appData);
  return Boolean(ownerId && signedInUserId && ownerId !== signedInUserId);
}

// Edits on this device that never reached the cloud - these would be lost.
// At sign-out the app checks the account's cloud backup against this device
// and records which version it confirmed (verifiedSafeForChangeAt). Any later
// edit changes lastDataChangedAt, so a stale confirmation never counts.
export function getDataChangeKey(appData) {
  return appData?.settings?.lastDataChangedAt || "none";
}

export function hasUnsyncedLocalChanges(appData) {
  const cloud = appData?.settings?.cloudBackup || {};
  if (!cloud.cloudBackupNeeded) return false;
  return cloud.verifiedSafeForChangeAt !== getDataChangeKey(appData);
}

export function confirmDiscardUnsyncedChanges(appData) {
  if (!hasUnsyncedLocalChanges(appData)) return true;
  const previous = appData?.settings?.cloudBackup?.cloudUserEmail || "the previous account";
  return window.confirm(
    `This device still has changes for ${previous} that haven't been backed up to the cloud yet.\n\n`
    + "Signing in as a different account will remove them from this device.\n\n"
    + "Press Cancel to stay signed out - sign back in as the previous account first and let it finish backing up."
  );
}

// Removes the previous account's budget (and its receipts and local
// snapshots) from this browser.
export async function wipeLocalDataForAccountSwitch() {
  await clearAppData();
  try {
    await clearAllStoredReceipts();
  } catch (error) {
    logWarning("Could not clear stored receipts while switching account", error);
  }
}

// A blank budget for the account that has just signed in. It deliberately
// has no lastDataChangedAt and no linked-local-data marker, so this device
// counts as a new device: the sync check opens the account's cloud copy, and
// the blank copy can never be uploaded over it.
export function buildFreshDataForAccount(previousData, user, username = "") {
  const fresh = getInitialAppData();
  const previousCloud = previousData?.settings?.cloudBackup || {};
  const email = String(user?.email || "").trim().toLowerCase();
  return {
    ...fresh,
    settings: {
      ...fresh.settings,
      cloudBackup: {
        provider: "supabase",
        mode: "auto-cloud-backup",
        enabled: true,
        requireLoginBeforeData: true,
        supabaseUrl: "",
        supabaseAnonKey: "",
        tableName: previousCloud.tableName || "gh_cloud_backups",
        cloudUserId: user?.id || null,
        cloudUserEmail: email,
        cloudUsername: String(username || user?.user_metadata?.username || "").trim().toLowerCase(),
        lastSignedInAt: new Date().toISOString(),
        cloudBackupNeeded: false,
        lastCloudError: null,
        version: "1"
      }
    }
  };
}
