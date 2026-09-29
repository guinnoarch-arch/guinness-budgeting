import { buildDataFingerprint } from "./cloudMergeService.js";
import { normaliseAppData } from "./storageService.js";

// Keeps every device on the newest version of the budget. Each copy of the
// data records when it was last really edited (settings.lastDataChangedAt,
// bumped by markAppDataChanged on every change), so whichever copy was
// edited most recently wins:
//  - the cloud copy is newer  -> open it on this device ("download")
//  - this device is newer     -> upload it ("upload")
//  - same data / same time    -> nothing to do ("none")
// When downloading would overwrite edits on this device that never reached
// the cloud, `protectLocal` is set so the caller first saves this device's
// copy to the cloud as a separate safety backup — nothing is lost, it's just
// not the version that opens.

export const SYNC_SAFETY_BACKUP_TYPE = "sync-safety";
export const SYNC_SAFETY_SOURCE = `${SYNC_SAFETY_BACKUP_TYPE}-cloud-backup`;

// A device that has never been set up: still on the first-run screen, never
// linked to the cloud, nothing real entered. It should just open the cloud
// copy. (The starting example accounts don't count as the user's data.)
export function isFreshDevice(data) {
  if (!data) return true;
  const settings = data.settings || {};
  const cloud = settings.cloudBackup || {};
  if (settings.hasStarted || settings.hasCompletedSetup || cloud.linkedLocalDataAt || cloud.lastCloudBackupAt) return false;
  return !(data.transactions || []).some(item => item && !item.isExample);
}

export function getDataChangedTime(data, fallback = null) {
  const value = data?.settings?.lastDataChangedAt || fallback;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function decideCloudSync(localData, cloudData, cloudRow = null) {
  const localHasUnsyncedChanges = Boolean(localData?.settings?.cloudBackup?.cloudBackupNeeded);

  if (!cloudData) {
    return {
      action: localHasUnsyncedChanges ? "upload" : "none",
      reason: "no_cloud_backup",
      localTime: getDataChangedTime(localData),
      cloudTime: 0,
      localHasUnsyncedChanges
    };
  }

  const localFingerprint = buildDataFingerprint(localData);
  const cloudFingerprint = buildDataFingerprint(cloudData);
  const localTime = getDataChangedTime(localData);
  const cloudTime = getDataChangedTime(cloudData, cloudRow?.client_generated_at || cloudRow?.created_at);
  const base = { localTime, cloudTime, localHasUnsyncedChanges, localFingerprint, cloudFingerprint };

  if (localFingerprint.checksum === cloudFingerprint.checksum || localTime === cloudTime) {
    return { ...base, action: "none", reason: "same_version" };
  }
  if (cloudTime > localTime) {
    return { ...base, action: "download", reason: "cloud_newer", protectLocal: localHasUnsyncedChanges };
  }
  return { ...base, action: "upload", reason: "local_newer" };
}

// The cloud copy, ready to open on this device. Its own edit time is kept
// (so both devices now agree on the version), while this device's cloud
// connection settings (sign-in, table, auto-backup choices) stay as they
// are — those belong to the device, not the budget.
export function applyCloudDataForSync(localData, cloudData, cloudRow, syncedAt = new Date().toISOString(), message = "Opened the newer version from the cloud") {
  const safeCloud = normaliseAppData(cloudData);
  const localCloudSettings = localData?.settings?.cloudBackup || {};
  return normaliseAppData({
    ...safeCloud,
    settings: {
      ...safeCloud.settings,
      hasStarted: true,
      cloudBackup: {
        ...localCloudSettings,
        enabled: true,
        linkedLocalDataAt: localCloudSettings.linkedLocalDataAt || syncedAt,
        cloudBackupNeeded: false,
        cloudConflict: null,
        lastCloudError: null,
        lastCloudBackupId: cloudRow?.id || localCloudSettings.lastCloudBackupId || null,
        lastCloudBackupAt: cloudRow?.created_at || localCloudSettings.lastCloudBackupAt || null,
        lastCloudRestoreAt: syncedAt,
        lastCloudSyncAt: syncedAt,
        lastCloudSyncMessage: message
      }
    }
  });
}

export function describeSyncTime(time) {
  if (!time) return "an unknown time";
  return new Date(time).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
