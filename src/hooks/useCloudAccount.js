import { useEffect, useState } from "react";
import { logWarning } from "../utils/logger.js";
import { getStoredCloudSessionSummary, isCloudLoginGateRequired, refreshSupabaseCloudSession } from "../services/cloudBackupService.js";
import { DEFAULT_ADMIN_ACCESS_STATE, DEFAULT_APP_NOTICES, fetchAdminAccessState, getAppNotices } from "../services/adminService.js";

const DISMISSED_BROADCAST_STORAGE_KEY = "ghBudgetingDismissedBroadcastId";
// How often the signed-in session and admin notices are re-checked.
const CLOUD_SESSION_REFRESH_INTERVAL_MS = 60 * 1000;
const APP_NOTICES_POLL_INTERVAL_MS = 60 * 1000;

function readStoredDismissedBroadcastId() {
  try {
    return window.localStorage.getItem(DISMISSED_BROADCAST_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

// The signed-in cloud account: its session (refreshed in the background),
// what the admin allows it to do, and admin notices such as maintenance
// mode and broadcast messages.
export default function useCloudAccount(appData) {
  const [cloudAuthSummary, setCloudAuthSummary] = useState(() => getStoredCloudSessionSummary());
  const [adminAccessState, setAdminAccessState] = useState(DEFAULT_ADMIN_ACCESS_STATE);
  const [appNotices, setAppNotices] = useState(DEFAULT_APP_NOTICES);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState(readStoredDismissedBroadcastId);

  useEffect(() => {
    if (!appData || !isCloudLoginGateRequired(appData.settings)) return undefined;

    let cancelled = false;

    async function refreshCloudAuth() {
      const summary = getStoredCloudSessionSummary(appData.settings);
      if (!summary.signedIn || !summary.isExpired || summary.appExpired) {
        if (!cancelled) setCloudAuthSummary(summary);
        return;
      }

      try {
        await refreshSupabaseCloudSession(appData.settings);
        if (!cancelled) setCloudAuthSummary(getStoredCloudSessionSummary(appData.settings));
      } catch (error) {
        logWarning("Could not refresh Supabase session", error);
        if (!cancelled) setCloudAuthSummary(getStoredCloudSessionSummary(appData.settings));
      }
    }

    refreshCloudAuth();
    const timer = window.setInterval(refreshCloudAuth, CLOUD_SESSION_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    appData?.settings?.cloudBackup?.requireLoginBeforeData,
    appData?.settings?.cloudBackup?.supabaseUrl,
    appData?.settings?.cloudBackup?.supabaseAnonKey,
    appData?.settings?.cloudBackup?.cloudUserId
  ]);

  useEffect(() => {
    if (!appData) return undefined;
    let cancelled = false;

    async function loadAdminAccess() {
      const nextState = await fetchAdminAccessState(appData.settings, cloudAuthSummary);
      if (!cancelled) setAdminAccessState(nextState);
    }

    loadAdminAccess();
    return () => {
      cancelled = true;
    };
    // Boolean(appData): also run once the saved data has loaded. On a device
    // with nothing saved yet the settings below are identical before and
    // after loading, so without it a device that's already signed in never
    // ran this check and sat on "Checking account access".
  }, [
    Boolean(appData),
    appData?.settings?.cloudBackup?.supabaseUrl,
    appData?.settings?.cloudBackup?.supabaseAnonKey,
    cloudAuthSummary?.signedIn,
    cloudAuthSummary?.user?.id
  ]);

  // Maintenance mode and broadcast messages are server state meant to reach
  // every signed-in session promptly, not just at next sign-in - so this
  // polls on the same cadence as the cloud session refresh above, instead of
  // fetching once and going stale for the rest of the session.
  useEffect(() => {
    if (!appData) return undefined;
    if (!cloudAuthSummary?.signedIn) return undefined;
    let cancelled = false;

    async function poll() {
      const next = await getAppNotices(appData.settings || {});
      if (!cancelled) setAppNotices(next);
    }

    poll();
    const timer = window.setInterval(poll, APP_NOTICES_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    appData?.settings?.cloudBackup?.supabaseUrl,
    appData?.settings?.cloudBackup?.supabaseAnonKey,
    cloudAuthSummary?.signedIn,
    cloudAuthSummary?.user?.id
  ]);

  function refreshCloudAuthState() {
    setCloudAuthSummary(getStoredCloudSessionSummary(appData?.settings));
  }

  async function refreshAdminAccess() {
    const summary = getStoredCloudSessionSummary(appData?.settings);
    setCloudAuthSummary(summary);
    const nextState = await fetchAdminAccessState(appData?.settings || {}, summary);
    setAdminAccessState(nextState);
    return nextState;
  }

  async function refreshAppNotices() {
    if (!appData) return undefined;
    const next = await getAppNotices(appData.settings || {});
    setAppNotices(next);
    return next;
  }

  function dismissBroadcast(id) {
    setDismissedBroadcastId(id);
    try {
      window.localStorage.setItem(DISMISSED_BROADCAST_STORAGE_KEY, id);
    } catch {
      // Dismissal is a per-device convenience only; failing to persist it
      // just means the same message can reappear next load.
    }
  }

  return {
    cloudAuthSummary,
    setCloudAuthSummary,
    adminAccessState,
    appNotices,
    dismissedBroadcastId,
    refreshCloudAuthState,
    refreshAdminAccess,
    refreshAppNotices,
    dismissBroadcast
  };
}
