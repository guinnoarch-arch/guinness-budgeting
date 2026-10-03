import { useEffect, useRef, useState } from "react";
import { logWarning } from "../utils/logger.js";
import { getErrorMessage } from "../utils/errors.js";
import { parseBackupObject, prepareRestoredAppData } from "../services/storageService.js";
import {
  fetchLatestSupabaseCloudBackupMeta,
  fetchSupabaseCloudBackup,
  getStoredCloudSessionSummary,
  isCloudBackupConfigured,
  isCloudSessionAllowed,
  uploadSupabaseCloudBackup
} from "../services/cloudBackupService.js";
import { buildDataFingerprint } from "../services/cloudMergeService.js";
import {
  SYNC_SAFETY_BACKUP_TYPE,
  applyCloudDataForSync,
  decideCloudSync,
  describeSyncTime,
  isFreshDevice
} from "../services/cloudSyncService.js";

// Coming back to the app re-checks the cloud at most this often.
const SYNC_ON_RESUME_MIN_GAP_MS = 30 * 1000;
// Two copies saved within this window are treated as the same version.
const SAME_VERSION_TOLERANCE_MS = 30 * 1000;
// Changes are uploaded this long after the last edit, so a burst of edits
// becomes one backup.
const AUTO_BACKUP_DELAY_MS = 20 * 1000;

// Cloud backup and keeping devices in sync: uploads, the "is the cloud
// newer?" check, and choosing between copies when they disagree.
export default function useCloudSync({ appData, appDataRef, setAppData, cloudAuthSummary, adminAccessState, backupNow }) {
  const [cloudBackupStatus, setCloudBackupStatus] = useState("");
  // Which cloud action can be retried from the status message: "backup" or "sync".
  const [cloudStatusRetry, setCloudStatusRetry] = useState(null);
  const [cloudConflict, setCloudConflict] = useState(null);
  // Device sync: false until the first "is the cloud newer?" check has run
  // (or isn't applicable), so nothing uploads this device's copy before
  // we know it isn't an older version.
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const cloudSyncReadyRef = useRef(false);
  cloudSyncReadyRef.current = cloudSyncReady;
  const syncInFlightRef = useRef(false);
  const lastSyncCheckRef = useRef(0);
  const syncWithCloudRef = useRef(null);
  const cloudBackupNowRef = useRef(null);

  async function cloudBackupNow({ backupType = "manual", requireConfirm = true } = {}) {
    const appData = appDataRef.current;
    if (!appData) return null;
    if (adminAccessState.loaded && adminAccessState.isBlocked) {
      setCloudBackupStatus("Your account has been blocked. Contact the app admin.");
      return null;
    }
    const settings = appData.settings || {};
    if (!isCloudBackupConfigured(settings)) {
      setCloudBackupStatus("Cloud backup isn't available in this version of the app. Your data is still saved on this device.");
      return null;
    }
    if (!isCloudSessionAllowed(settings, cloudAuthSummary)) {
      setCloudBackupStatus("Sign in to back up to the cloud. Go to Settings, then Cloud backup.");
      return null;
    }
    if (requireConfirm && !confirm("Upload the current local app data as a cloud backup?")) return null;

    setCloudStatusRetry(null);
    setCloudBackupStatus("Backing up to the cloud…");
    try {
      const row = await uploadSupabaseCloudBackup(settings, appData, {
        exportedAt: new Date().toISOString(),
        backupType,
        label: backupType === "auto" ? "Automatic cloud backup" : "Manual cloud backup"
      });
      const uploadedAt = row?.created_at || new Date().toISOString();
      const uploadedChangeAt = appData.settings?.lastDataChangedAt || null;
      setAppData(prev => ({
        ...prev,
        settings: {
          ...(prev.settings || {}),
          cloudBackup: {
            ...(prev.settings?.cloudBackup || {}),
            enabled: true,
            linkedLocalDataAt: prev.settings?.cloudBackup?.linkedLocalDataAt || uploadedAt,
            // Anything edited while the upload was in flight still needs
            // uploading.
            cloudBackupNeeded: (prev.settings?.lastDataChangedAt || null) !== uploadedChangeAt,
            lastCloudBackupAt: uploadedAt,
            lastAutoCloudBackupAt: backupType === "auto" ? uploadedAt : prev.settings?.cloudBackup?.lastAutoCloudBackupAt || null,
            lastCloudBackupId: row?.id || prev.settings?.cloudBackup?.lastCloudBackupId || null,
            lastCloudError: null
          }
        }
      }));
      setCloudBackupStatus("Backed up to the cloud.");
      window.setTimeout(() => setCloudBackupStatus(""), 3000);
      return row;
    } catch (error) {
      const message = getErrorMessage(error, "The cloud backup didn't finish. Your data is still saved on this device — try again in a moment.");
      setCloudBackupStatus(message);
      setCloudStatusRetry("backup");
      setAppData(prev => ({
        ...prev,
        settings: {
          ...(prev.settings || {}),
          cloudBackup: {
            ...(prev.settings?.cloudBackup || {}),
            cloudBackupNeeded: true,
            lastCloudError: message
          }
        }
      }));
      return null;
    }
  }

  cloudBackupNowRef.current = cloudBackupNow;

  useEffect(() => {
    if (!appData) return undefined;
    if (adminAccessState.loaded && adminAccessState.isBlocked) return undefined;
    const cloud = appData.settings?.cloudBackup || {};
    if (!cloud.enabled || cloud.autoBackupEnabled === false || !cloud.linkedLocalDataAt || !cloud.cloudBackupNeeded) return undefined;
    if (!isCloudBackupConfigured(appData.settings) || !isCloudSessionAllowed(appData.settings, cloudAuthSummary)) return undefined;
    if (!cloudSyncReady) return undefined;

    // Through the sync check rather than straight to upload, so an older
    // copy on this device can never be pushed over a newer one from
    // another device.
    const timer = window.setTimeout(() => {
      syncWithCloudRef.current?.("auto-backup");
    }, AUTO_BACKUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    appData?.settings?.cloudBackup?.enabled,
    appData?.settings?.cloudBackup?.autoBackupEnabled,
    appData?.settings?.cloudBackup?.linkedLocalDataAt,
    appData?.settings?.cloudBackup?.cloudBackupNeeded,
    appData?.settings?.lastDataChangedAt,
    cloudAuthSummary?.signedIn,
    cloudAuthSummary?.isExpired,
    adminAccessState?.loaded,
    adminAccessState?.isBlocked,
    cloudSyncReady
  ]);

  // Keeps this device on the newest version of the budget. Runs when the
  // app opens (once signed in), whenever it comes back into view, and when
  // the connection returns. Whichever copy was edited most recently wins:
  // a newer cloud copy is opened here, a newer local copy is uploaded. If
  // opening the cloud copy would drop edits this device never uploaded,
  // those are first saved to the cloud as a separate safety backup. With
  // "Keep my devices in sync" turned off it falls back to the old
  // behaviour of asking which copy to keep.
  async function syncWithCloud(trigger = "open") {
    const data = appDataRef.current;
    if (!data || syncInFlightRef.current) return;
    const settings = data.settings || {};
    const cloud = settings.cloudBackup || {};
    const configured = isCloudBackupConfigured(settings) && isCloudSessionAllowed(settings, getStoredCloudSessionSummary(settings));
    // A brand-new device (nothing saved here yet) opens the cloud copy. A
    // device with its own data that was never linked keeps the existing
    // "link local data" safety step in Settings instead.
    const isNewDevice = isFreshDevice(data);
    if (!configured || (!cloud.linkedLocalDataAt && !isNewDevice)) {
      setCloudSyncReady(true);
      return;
    }
    // Sync turned off: auto backups upload as they always did, and the
    // "which copy?" check only happens when the app opens.
    if (cloud.autoSyncOnOpen === false && !isNewDevice) {
      if (trigger === "auto-backup") {
        cloudBackupNowRef.current?.({ backupType: "auto", requireConfirm: false });
        return;
      }
      if (trigger !== "open") return;
    }

    syncInFlightRef.current = true;
    if (trigger !== "auto-backup") lastSyncCheckRef.current = Date.now();
    try {
      const syncedAt = new Date().toISOString();
      // Cheap check first: only download the whole backup when its data
      // was edited more recently than this device's.
      const meta = await fetchLatestSupabaseCloudBackupMeta(settings);
      const localChangedTime = new Date(appDataRef.current?.settings?.lastDataChangedAt || 0).getTime();
      const cloudChangedTime = meta?.data_changed_at ? new Date(meta.data_changed_at).getTime() : null;
      const needsFullBackup = Boolean(meta) && (
        cloud.autoSyncOnOpen === false || isNewDevice || cloudChangedTime === null || cloudChangedTime > localChangedTime
      );
      const latest = needsFullBackup ? await fetchSupabaseCloudBackup(settings, meta.id) : null;
      const cloudData = latest
        ? parseBackupObject(latest.backup_json, `cloud-backup-${String(latest.id || "").slice(0, 8)}.json`).data
        : null;
      const current = appDataRef.current;
      const recordSync = message => setAppData(prev => prev ? ({
        ...prev,
        settings: {
          ...(prev.settings || {}),
          cloudBackup: { ...(prev.settings?.cloudBackup || {}), lastCloudSyncAt: syncedAt, lastCloudSyncMessage: message }
        }
      }) : prev);

      if (cloud.autoSyncOnOpen === false && !isNewDevice) {
        if (!cloudData) return;
        const localFingerprint = buildDataFingerprint(current);
        const cloudFingerprint = buildDataFingerprint(cloudData);
        if (localFingerprint.checksum === cloudFingerprint.checksum) return;
        const cloudTime = new Date(cloudFingerprint.updatedAt || latest.client_generated_at || latest.created_at || 0).getTime();
        const localTime = new Date(localFingerprint.updatedAt || 0).getTime();
        if (Math.abs(cloudTime - localTime) <= SAME_VERSION_TOLERANCE_MS) return;
        setCloudConflict({
          backupId: latest.id,
          createdAt: latest.client_generated_at || latest.created_at,
          counts: latest.counts || cloudFingerprint.counts || null,
          row: latest,
          cloudData,
          localFingerprint,
          cloudFingerprint,
          message: cloudTime > localTime ? "Cloud backup looks newer than local data." : "Local data looks newer than cloud backup."
        });
        return;
      }

      if (meta && !needsFullBackup) {
        if (cloudChangedTime === localChangedTime) {
          // Same version in both places.
          setAppData(prev => prev ? ({
            ...prev,
            settings: {
              ...(prev.settings || {}),
              cloudBackup: { ...(prev.settings?.cloudBackup || {}), cloudBackupNeeded: false, lastCloudSyncAt: syncedAt, lastCloudSyncMessage: "Already up to date" }
            }
          }) : prev);
          return;
        }
        if (isNewDevice) return;
        const row = await cloudBackupNowRef.current?.({ backupType: "auto", requireConfirm: false });
        recordSync(row ? "This device had the newest version, so it was uploaded" : "This device has the newest version, but the upload failed");
        return;
      }

      const decision = decideCloudSync(current, cloudData, latest);

      if (decision.action === "download") {
        if (decision.protectLocal) {
          try {
            await uploadSupabaseCloudBackup(settings, current, {
              backupType: SYNC_SAFETY_BACKUP_TYPE,
              label: `This device's copy before syncing (last changed ${describeSyncTime(decision.localTime)})`
            });
          } catch {
            // Couldn't keep a copy of this device's edits, so don't
            // overwrite them — ask instead.
            setCloudConflict({
              backupId: latest.id,
              createdAt: latest.client_generated_at || latest.created_at,
              counts: latest.counts || decision.cloudFingerprint?.counts || null,
              row: latest,
              cloudData,
              localFingerprint: decision.localFingerprint,
              cloudFingerprint: decision.cloudFingerprint,
              message: "The cloud has a newer version, but this device has changes that couldn't be backed up first. Choose which to keep."
            });
            return;
          }
        }
        // Edited on this device while we were checking? Leave it for the
        // next check rather than replacing what was just typed.
        if ((appDataRef.current?.settings?.lastDataChangedAt || null) !== (current.settings?.lastDataChangedAt || null)) return;
        const syncMessage = `Synced: opened the newer version from the cloud (last changed ${describeSyncTime(decision.cloudTime)})${decision.protectLocal
          ? `. This device also had changes from ${describeSyncTime(decision.localTime)} that weren't in it — they're saved as the cloud backup "This device's copy before syncing" if you need them.`
          : "."}`;
        setAppData(applyCloudDataForSync(current, cloudData, latest, syncedAt, syncMessage));
        setCloudConflict(null);
        setCloudBackupStatus(syncMessage);
        // A plain update clears itself; one that set aside this device's
        // edits stays until something else replaces it, so it isn't missed.
        if (!decision.protectLocal) window.setTimeout(() => setCloudBackupStatus(""), 8000);
        return;
      }

      if (isNewDevice) return;

      if (decision.action === "upload") {
        const row = await cloudBackupNowRef.current?.({ backupType: "auto", requireConfirm: false });
        recordSync(row ? "This device had the newest version, so it was uploaded" : "This device has the newest version, but the upload failed");
        return;
      }

      recordSync("Already up to date");
    } catch (error) {
      logWarning(`Cloud sync check (${trigger}) failed`, error);
      setCloudBackupStatus(getErrorMessage(error, "Couldn't check the cloud for a newer version. You can keep working — this device's data is saved."));
      setCloudStatusRetry("sync");
    } finally {
      syncInFlightRef.current = false;
      setCloudSyncReady(true);
    }
  }
  syncWithCloudRef.current = syncWithCloud;

  // On open / sign-in.
  useEffect(() => {
    if (!appData) return;
    if (!adminAccessState.loaded && cloudAuthSummary?.signedIn) {
      // Just signed in: hold uploads until the check below has run.
      setCloudSyncReady(false);
      return;
    }
    if (adminAccessState.loaded && adminAccessState.isBlocked) {
      setCloudSyncReady(true);
      return;
    }
    syncWithCloudRef.current?.("open");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(appData), cloudAuthSummary?.signedIn, cloudAuthSummary?.user?.id, adminAccessState?.loaded, adminAccessState?.isBlocked]);

  // Coming back to the app (e.g. reopening it on a phone where it stayed
  // open in the background), or the connection returning: check again. Going
  // away: upload any waiting changes now, so the other device sees them.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastSyncCheckRef.current > SYNC_ON_RESUME_MIN_GAP_MS) syncWithCloudRef.current?.("resume");
        return;
      }
      flushPendingCloudBackup();
    }
    function handleOnline() {
      syncWithCloudRef.current?.("online");
    }
    function flushPendingCloudBackup() {
      const data = appDataRef.current;
      const cloud = data?.settings?.cloudBackup || {};
      if (!data || !cloudSyncReadyRef.current || !cloud.cloudBackupNeeded || cloud.autoBackupEnabled === false || !cloud.linkedLocalDataAt) return;
      if (!isCloudBackupConfigured(data.settings) || !isCloudSessionAllowed(data.settings, getStoredCloudSessionSummary(data.settings))) return;
      syncWithCloudRef.current?.("auto-backup");
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flushPendingCloudBackup);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flushPendingCloudBackup);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  function clearCloudConflict() {
    setCloudConflict(null);
    setAppData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        cloudBackup: {
          ...(prev.settings?.cloudBackup || {}),
          cloudConflict: null
        }
      }
    }));
  }

  async function keepLocalAfterConflict() {
    clearCloudConflict();
    setCloudBackupStatus("Keeping local data. Cloud was not overwritten.");
  }

  async function keepBothAfterConflict() {
    await backupNow();
    clearCloudConflict();
    setCloudBackupStatus("Kept local and cloud separately. Local JSON backup was offered.");
  }

  async function chooseCloudAfterConflict() {
    if (!cloudConflict?.cloudData) return;
    await backupNow();
    const restoredAt = new Date().toISOString();
    const nextData = prepareRestoredAppData(
      cloudConflict.cloudData,
      `cloud-backup-${String(cloudConflict.backupId || "").slice(0, 8)}.json`,
      restoredAt,
      {
        source: "supabase-cloud-backup",
        exportedAt: cloudConflict.createdAt || restoredAt,
        dataSchemaVersion: cloudConflict.cloudFingerprint?.dataVersion || "unknown"
      }
    );
    setAppData({
      ...nextData,
      settings: {
        ...(nextData.settings || {}),
        cloudBackup: {
          ...(appData.settings?.cloudBackup || {}),
          cloudConflict: null,
          lastCloudRestoreAt: restoredAt,
          lastCloudError: null
        }
      }
    });
    setCloudConflict(null);
    setCloudBackupStatus("Cloud backup restored on this device.");
  }

  async function applyReviewedMerge(mergeReview) {
    if (!mergeReview?.mergedData) return;
    await backupNow();
    const mergedAt = new Date().toISOString();
    setAppData({
      ...mergeReview.mergedData,
      settings: {
        ...(mergeReview.mergedData.settings || {}),
        cloudBackup: {
          ...(appData.settings?.cloudBackup || {}),
          cloudBackupNeeded: true,
          cloudConflict: null,
          lastCloudError: null
        },
        lastDataChangedAt: mergedAt,
        lastChangeReason: "Reviewed cloud/local merge saved locally",
        hasUnbackedChanges: true
      }
    });
    setCloudConflict(null);
    setCloudBackupStatus("Merged data saved locally. Upload to cloud only after confirmation.");
  }

  function retryCloudAction() {
    const action = cloudStatusRetry;
    setCloudStatusRetry(null);
    setCloudBackupStatus("");
    if (action === "backup") cloudBackupNowRef.current?.({ requireConfirm: false });
    // Same as the check on opening the app, which runs even when automatic sync is off.
    if (action === "sync") syncWithCloudRef.current?.("open");
  }

  function dismissCloudStatus() {
    setCloudStatusRetry(null);
    setCloudBackupStatus("");
  }

  return {
    cloudBackupStatus,
    setCloudBackupStatus,
    cloudStatusRetry,
    cloudConflict,
    cloudSyncReady,
    cloudBackupNow,
    retryCloudAction,
    dismissCloudStatus,
    keepLocalAfterConflict,
    keepBothAfterConflict,
    chooseCloudAfterConflict,
    applyReviewedMerge
  };
}
