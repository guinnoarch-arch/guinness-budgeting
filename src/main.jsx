import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";

import AppShell from "./components/layout/AppShell.jsx";
import ErrorBoundary from "./components/layout/ErrorBoundary.jsx";
import WelcomeScreen from "./components/setup/WelcomeScreen.jsx";
import CloudLoginGate from "./components/auth/CloudLoginGate.jsx";
import CloudConflictScreen from "./components/auth/CloudConflictScreen.jsx";

import DashboardPage from "./pages/DashboardPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import BudgetsPage from "./pages/BudgetsPage.jsx";
import BillsPage from "./pages/BillsPage.jsx";
import SavingsPage from "./pages/SavingsPage.jsx";
import AccountsPage from "./pages/AccountsPage.jsx";
import LoansPage from "./pages/LoansPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import ControlCentrePage from "./pages/ControlCentrePage.jsx";

import { getInitialAppData } from "./data/exampleData.js";
import {
  STORAGE_LOAD_FAILURE_CODE,
  exportJsonBackup,
  exportRawSavedData,
  loadAppDataAsync,
  markAppDataChanged,
  parseBackupFile,
  parseBackupObject,
  prepareDataForBackupExport,
  prepareRestoredAppData,
  saveAppData,
  updateLocalProfile
} from "./services/storageService.js";
import { processRecurringItems } from "./services/recurringService.js";
import { getMonthKey } from "./utils/dates.js";
import { applyServiceWorkerUpdate, isStandaloneDisplayMode, registerAppServiceWorker } from "./services/pwaService.js";
import {
  clearStoredCloudSession,
  fetchLatestSupabaseCloudBackup,
  getStoredCloudSessionSummary,
  isCloudBackupConfigured,
  isCloudLoginGateRequired,
  isCloudSessionAllowed,
  refreshSupabaseCloudSession,
  uploadSupabaseCloudBackup
} from "./services/cloudBackupService.js";
import { getDisplayUsernameFromSession } from "./services/authService.js";
import { ADMIN_ROUTE_PATH, DEFAULT_ADMIN_ACCESS_STATE, fetchAdminAccessState, getAdminStatus, getFeatureFlags } from "./services/adminService.js";
import { buildDataFingerprint } from "./services/cloudMergeService.js";
import { clearLocalAccessSession, hasUsableLocalBudgetData, isLocalAccessSessionAllowed, storeLocalAccessSession } from "./services/localAccessService.js";


const PHONE_MODE_STORAGE_KEY = "ghBudgetingPhoneMode";

function readStoredPhoneMode() {
  try {
    return window.localStorage.getItem(PHONE_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function sanitiseHexColour(value, fallback = "#0b5d45") {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function hexToRgb(hex) {
  const clean = sanitiseHexColour(hex).replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function darkenHexColour(hex, amount = 0.22) {
  const { r, g, b } = hexToRgb(hex);
  const next = [r, g, b].map(channel => Math.max(0, Math.round(channel * (1 - amount))));
  return `#${next.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function resolveThemeMode(themeMode) {
  if (themeMode === "dark") return "dark";
  if (themeMode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

const pages = {
  dashboard: DashboardPage,
  transactions: TransactionsPage,
  budgets: BudgetsPage,
  bills: BillsPage,
  savings: SavingsPage,
  accounts: AccountsPage,
  loans: LoansPage,
  reports: ReportsPage,
  import: ImportPage,
  control: ControlCentrePage,
  settings: SettingsPage
};

function PhoneModeToggle({ phoneMode, onToggle }) {
  return (
    <button
      type="button"
      className={`secondary-button phone-mode-toggle ${phoneMode ? "active" : ""}`}
      onClick={onToggle}
      aria-pressed={phoneMode}
      title={phoneMode ? "Return to desktop layout" : "Use compact phone-friendly layout"}
    >
      {phoneMode ? "Desktop view" : "Phone view"}
    </button>
  );
}

function StorageRecoveryScreen({ error, phoneMode, onTogglePhoneMode, onRestoreBackup, onStartFresh }) {
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function exportRawBackup() {
    setIsBusy(true);
    setStatus("Preparing emergency raw storage export...");
    try {
      const result = await exportRawSavedData();
      setStatus(result.ok ? "Emergency raw storage export saved." : "Export was cancelled.");
    } catch (exportError) {
      console.error("Emergency raw storage export failed:", exportError);
      setStatus(exportError.message || "Emergency export failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBackupFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsBusy(true);
    setStatus("Checking backup file...");
    try {
      const preview = await parseBackupFile(file);
      const restoredAt = new Date().toISOString();
      const restoredData = prepareRestoredAppData(preview.data, preview.filename, restoredAt, preview.meta);
      onRestoreBackup(restoredData);
      setStatus("Backup restored locally.");
    } catch (restoreError) {
      console.error("Recovery restore failed:", restoreError);
      setStatus(restoreError.message || "Could not restore that backup file.");
    } finally {
      setIsBusy(false);
    }
  }

  function confirmStartFresh() {
    const phrase = prompt("Only start fresh if you are sure there is no local data to recover. Type START FRESH to continue.");
    if (phrase === "START FRESH") onStartFresh();
  }

  return (
    <main className={`storage-recovery-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card storage-recovery-card">
        <div className="recovery-top-row">
          <div>
            <p className="eyebrow">Storage recovery</p>
            <h1>Saved data was not loaded</h1>
          </div>
          <PhoneModeToggle phoneMode={phoneMode} onToggle={onTogglePhoneMode} />
        </div>

        <p className="muted-text">
          The app did not replace your saved data with defaults. This screen appears when browser storage could not be read safely.
        </p>

        <div className="backup-warning-box danger-box">
          <strong>Local data is being protected</strong>
          <span>Do not reset the app unless you have a backup or you are sure this browser has no budget data to recover.</span>
        </div>

        <div className="backup-warning-box">
          <strong>Recovery options</strong>
          <span>Export raw browser storage first, then restore a JSON backup. Cloud backup restore is available after you get back into the app and sign in.</span>
        </div>

        {error?.message && (
          <div className="warning-row orange">
            <strong>Storage error</strong>
            <small>{error.message}</small>
          </div>
        )}

        <div className="backup-actions-row">
          <button type="button" className="secondary-button" onClick={exportRawBackup} disabled={isBusy}>
            Export raw storage
          </button>
          <label className="secondary-button recovery-file-button">
            Restore JSON backup
            <input type="file" accept="application/json,.json" onChange={handleBackupFile} disabled={isBusy} />
          </label>
          <button type="button" className="primary-button" onClick={() => window.location.reload()} disabled={isBusy}>
            Retry loading data
          </button>
        </div>

        <div className="row-actions">
          <button type="button" className="text-button danger-text" onClick={confirmStartFresh} disabled={isBusy}>
            Start fresh only if no data needs recovery
          </button>
        </div>

        {status && <p className="cloud-status-message">{status}</p>}
      </section>
    </main>
  );
}

function App() {
  const [appData, setAppData] = useState(null);
  const [appLoadStatus, setAppLoadStatus] = useState("Loading saved data...");
  const [storageRecoveryError, setStorageRecoveryError] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const [selectedDashboardAccountId, setSelectedDashboardAccountId] = useState("all");
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [quickBackupStatus, setQuickBackupStatus] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installStatus, setInstallStatus] = useState("");
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [waitingServiceWorker, setWaitingServiceWorker] = useState(null);
  const [cloudAuthSummary, setCloudAuthSummary] = useState(() => getStoredCloudSessionSummary());
  const [cloudBackupStatus, setCloudBackupStatus] = useState("");
  const [cloudConflict, setCloudConflict] = useState(null);
  const [localAccessUnlocked, setLocalAccessUnlocked] = useState(() => isLocalAccessSessionAllowed());
  const [phoneMode, setPhoneMode] = useState(readStoredPhoneMode);
  const [preferredSettingsSection, setPreferredSettingsSection] = useState("");
  const [adminAccessState, setAdminAccessState] = useState(DEFAULT_ADMIN_ACCESS_STATE);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedData() {
      try {
        const savedData = await loadAppDataAsync();
        if (!cancelled) {
          setStorageRecoveryError(null);
          setAppData(savedData || getInitialAppData());
          setAppLoadStatus("");
        }
      } catch (error) {
        console.error("Failed to load saved app data:", error);
        if (!cancelled) {
          if (error?.code === STORAGE_LOAD_FAILURE_CODE) {
            setStorageRecoveryError(error);
            setAppData(null);
            setAppLoadStatus("Saved data could not be loaded safely.");
          } else {
            setStorageRecoveryError(error);
            setAppData(null);
            setAppLoadStatus("Storage load failed. Recovery options are available.");
          }
        }
      }
    }

    loadSavedData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appData) return;
    const processed = processRecurringItems(appData);
    if (processed.changed) {
      setAppData(processed.data);
    }
    // Only run after saved data has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(appData)]);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPage = params.get("page");
    const requestedAction = params.get("action");

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === ADMIN_ROUTE_PATH || path === "/control-centre") {
      setActivePage("control");
    } else if (requestedPage && pages[requestedPage]) {
      setActivePage(requestedPage);
    }

    if (requestedPage === "settings" && params.get("settings") === "profile") {
      setPreferredSettingsSection("profile");
    }

    if (requestedAction === "add-transaction") {
      setShowTransactionModal(true);
    }
  }, []);

  useEffect(() => {
    if (!appData) return undefined;
    const timer = window.setTimeout(() => {
      saveAppData(appData);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [appData]);

  useEffect(() => {
    if (!appData) return undefined;
    const themeMode = appData.settings?.themeMode || (appData.settings?.darkModeEnabled ? "dark" : "light");
    const accentColor = sanitiseHexColour(appData.settings?.accentColor || "#0b5d45");
    const accentDark = darkenHexColour(accentColor, 0.24);
    const { r, g, b } = hexToRgb(accentColor);

    function applyTheme() {
      document.documentElement.setAttribute("data-theme", resolveThemeMode(themeMode));
      document.documentElement.setAttribute("data-theme-mode", themeMode);
      document.documentElement.style.setProperty("--primary", accentColor);
      document.documentElement.style.setProperty("--primary-dark", accentDark);
      document.documentElement.style.setProperty("--primary-rgb", `${r}, ${g}, ${b}`);
    }

    applyTheme();

    if (themeMode !== "system" || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener?.("change", applyTheme);
    return () => mediaQuery.removeEventListener?.("change", applyTheme);
  }, [appData?.settings?.themeMode, appData?.settings?.darkModeEnabled, appData?.settings?.accentColor]);

  useEffect(() => {
    if (!appData?.settings?.hasUnbackedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [appData?.settings?.hasUnbackedChanges]);


  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallStatus("");
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallStatus("Installed successfully.");
    }

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    registerAppServiceWorker({
      onOfflineReady: () => setServiceWorkerReady(true),
      onUpdateReady: (worker) => setWaitingServiceWorker(worker)
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PHONE_MODE_STORAGE_KEY, phoneMode ? "true" : "false");
    } catch {
      // Cosmetic preference only; ignore storage failures.
    }
  }, [phoneMode]);

  function updateAppData(nextOrUpdater, options = {}) {
    setAppData(prevData => {
      const nextData = typeof nextOrUpdater === "function" ? nextOrUpdater(prevData) : nextOrUpdater;
      return markAppDataChanged(nextData, options);
    });
  }

  function applyProfilePatch(prevData, profilePatch = {}) {
    return updateLocalProfile(prevData, profilePatch);
  }

  async function installApp() {
    if (!installPrompt) {
      setInstallStatus("Install prompt is not available yet. Use the browser menu and choose Install app/Add to Home Screen if available.");
      window.setTimeout(() => setInstallStatus(""), 5000);
      return;
    }

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setInstallStatus("Install accepted.");
    } else {
      setInstallStatus("Install cancelled. You can install later from Settings.");
    }

    window.setTimeout(() => setInstallStatus(""), 5000);
  }

  function dismissInstallPrompt() {
    updateAppData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        pwaInstallPromptDismissedAt: new Date().toISOString()
      }
    }), { reason: "Install prompt dismissed" });
  }

  function dismissBackupBanner() {
    setAppData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        backupBannerDismissedAt: new Date().toISOString()
      }
    }));
  }

  async function updateAppFromServiceWorker() {
    if (!waitingServiceWorker) return;

    if (appData?.settings?.hasUnbackedChanges) {
      const shouldContinue = confirm("You have changes since the last backup. Export a backup before updating unless you are sure. Continue with the app update?");
      if (!shouldContinue) return;
    }

    applyServiceWorkerUpdate(waitingServiceWorker);
  }

  async function backupNow() {
    const exportedAt = new Date().toISOString();
    const { nextData, filename } = prepareDataForBackupExport(appData, exportedAt);

    try {
      const result = await exportJsonBackup(nextData, exportedAt, filename);

      if (!result.ok) {
        if (result.cancelled) {
          setQuickBackupStatus("Backup cancelled");
          window.setTimeout(() => setQuickBackupStatus(""), 2500);
        }
        return;
      }

      setAppData(nextData);
      setQuickBackupStatus(result.method === "save-picker" ? "Backup saved" : "Backup downloaded");
      window.setTimeout(() => setQuickBackupStatus(""), 3000);
    } catch (error) {
      console.error("Backup failed:", error);
      setQuickBackupStatus("Backup failed");
      window.setTimeout(() => setQuickBackupStatus(""), 3500);
    }
  }

  async function cloudBackupNow({ backupType = "manual", requireConfirm = true } = {}) {
    if (!appData) return null;
    const settings = appData.settings || {};
    if (!isCloudBackupConfigured(settings)) {
      setCloudBackupStatus("Cloud backup unavailable");
      return null;
    }
    if (!isCloudSessionAllowed(settings, cloudAuthSummary)) {
      setCloudBackupStatus("Sign in before cloud backup");
      return null;
    }
    if (requireConfirm && !confirm("Upload the current local app data as a cloud backup?")) return null;

    setCloudBackupStatus("Backing up...");
    try {
      const row = await uploadSupabaseCloudBackup(settings, appData, {
        exportedAt: new Date().toISOString(),
        backupType,
        label: backupType === "auto" ? "Automatic cloud backup" : "Manual cloud backup"
      });
      const uploadedAt = row?.created_at || new Date().toISOString();
      setAppData(prev => ({
        ...prev,
        settings: {
          ...(prev.settings || {}),
          cloudBackup: {
            ...(prev.settings?.cloudBackup || {}),
            enabled: true,
            linkedLocalDataAt: prev.settings?.cloudBackup?.linkedLocalDataAt || uploadedAt,
            cloudBackupNeeded: false,
            lastCloudBackupAt: uploadedAt,
            lastAutoCloudBackupAt: backupType === "auto" ? uploadedAt : prev.settings?.cloudBackup?.lastAutoCloudBackupAt || null,
            lastCloudBackupId: row?.id || prev.settings?.cloudBackup?.lastCloudBackupId || null,
            lastCloudError: null
          }
        }
      }));
      setCloudBackupStatus("Cloud backup up to date");
      window.setTimeout(() => setCloudBackupStatus(""), 3000);
      return row;
    } catch (error) {
      const message = error.message || "Cloud backup failed";
      setCloudBackupStatus(message);
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
        console.warn("Could not refresh Supabase session:", error);
        if (!cancelled) setCloudAuthSummary(getStoredCloudSessionSummary(appData.settings));
      }
    }

    refreshCloudAuth();
    const timer = window.setInterval(refreshCloudAuth, 60000);

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

  function refreshCloudAuthState() {
    setCloudAuthSummary(getStoredCloudSessionSummary(appData?.settings));
  }

  function navigateToPage(page, options = {}) {
    setActivePage(page);
    if (options.settingsSection) setPreferredSettingsSection(options.settingsSection);

    try {
      const nextPath = page === "control" ? ADMIN_ROUTE_PATH : "/";
      const nextSearch = page === "dashboard"
        ? ""
        : page === "settings" && options.settingsSection
          ? `?page=settings&settings=${encodeURIComponent(options.settingsSection)}`
          : page === "control"
            ? ""
            : `?page=${encodeURIComponent(page)}`;
      window.history.pushState({}, "", `${nextPath}${nextSearch}`);
    } catch {
      // URL updates are ergonomic only; keep in-app navigation working.
    }
  }

  function openSettingsProfile() {
    navigateToPage("settings", { settingsSection: "profile" });
  }

  async function refreshAdminAccess() {
    const summary = getStoredCloudSessionSummary(appData?.settings);
    setCloudAuthSummary(summary);
    const nextState = await fetchAdminAccessState(appData?.settings || {}, summary);
    setAdminAccessState(nextState);
    return nextState;
  }

  function openLocalAccessMode() {
    if (!hasUsableLocalBudgetData(appData)) {
      setCloudBackupStatus("No trusted local budget data found on this device yet. Sign in first.");
      return;
    }
    storeLocalAccessSession();
    setLocalAccessUnlocked(true);
    setCloudBackupStatus("Opened in local-only mode. Cloud backup will resume after Supabase sign-in.");
    window.setTimeout(() => setCloudBackupStatus(""), 5000);
  }

  async function lockApp() {
    if (appData?.settings?.cloudBackup?.cloudBackupNeeded) {
      await cloudBackupNow({ backupType: "auto", requireConfirm: false });
    }
    clearStoredCloudSession();
    setCloudAuthSummary(getStoredCloudSessionSummary(appData?.settings));
  }

  async function logoutApp() {
    clearLocalAccessSession();
    setLocalAccessUnlocked(false);
    await lockApp();
  }

  useEffect(() => {
    if (!appData) return undefined;
    const cloud = appData.settings?.cloudBackup || {};
    if (!cloud.enabled || !cloud.linkedLocalDataAt || !cloud.cloudBackupNeeded) return undefined;
    if (!isCloudBackupConfigured(appData.settings) || !isCloudSessionAllowed(appData.settings, cloudAuthSummary)) return undefined;

    const timer = window.setTimeout(() => {
      cloudBackupNow({ backupType: "auto", requireConfirm: false });
    }, 45000);
    return () => window.clearTimeout(timer);
  }, [
    appData?.settings?.cloudBackup?.enabled,
    appData?.settings?.cloudBackup?.linkedLocalDataAt,
    appData?.settings?.cloudBackup?.cloudBackupNeeded,
    appData?.settings?.lastDataChangedAt,
    cloudAuthSummary?.signedIn,
    cloudAuthSummary?.isExpired
  ]);

  useEffect(() => {
    if (!appData) return undefined;
    const cloud = appData.settings?.cloudBackup || {};
    if (!cloud.linkedLocalDataAt || !isCloudBackupConfigured(appData.settings) || !isCloudSessionAllowed(appData.settings, cloudAuthSummary)) return undefined;
    if (cloud.lastCloudConflictAt && !cloud.cloudConflict) return undefined;

    let cancelled = false;
    async function checkLatestCloudBackup() {
      try {
        const latest = await fetchLatestSupabaseCloudBackup(appData.settings);
        if (cancelled || !latest) return;
        const preview = parseBackupObject(latest.backup_json, `cloud-backup-${String(latest.id || "").slice(0, 8)}.json`);
        const localFingerprint = buildDataFingerprint(appData);
        const cloudFingerprint = buildDataFingerprint(preview.data);
        const identical = localFingerprint.checksum === cloudFingerprint.checksum;
        const cloudTime = new Date(cloudFingerprint.updatedAt || latest.client_generated_at || latest.created_at || 0).getTime();
        const localTime = new Date(localFingerprint.updatedAt || appData.settings?.lastCloudBackupAt || 0).getTime();
        if (!identical && Math.abs(cloudTime - localTime) > 30000) {
          const nextConflict = {
            backupId: latest.id,
            createdAt: latest.client_generated_at || latest.created_at,
            counts: latest.counts || cloudFingerprint.counts || null,
            row: latest,
            cloudData: preview.data,
            localFingerprint,
            cloudFingerprint,
            message: cloudTime > localTime ? "Cloud backup looks newer than local data." : "Local data looks newer than cloud backup."
          };
          setCloudConflict(nextConflict);
          setAppData(prev => ({
            ...prev,
            settings: {
              ...(prev.settings || {}),
              cloudBackup: {
                ...(prev.settings?.cloudBackup || {}),
                cloudConflict: nextConflict,
                lastCloudConflictAt: new Date().toISOString()
              }
            }
          }));
        } else if (identical) {
          setCloudConflict(null);
        }
      } catch (error) {
        if (!cancelled) setCloudBackupStatus(error.message || "Could not check cloud backup");
      }
    }

    checkLatestCloudBackup();
    return () => {
      cancelled = true;
    };
  }, [appData?.settings?.cloudBackup?.linkedLocalDataAt, cloudAuthSummary?.signedIn]);

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
  }, [
    appData?.settings?.cloudBackup?.supabaseUrl,
    appData?.settings?.cloudBackup?.supabaseAnonKey,
    cloudAuthSummary?.signedIn,
    cloudAuthSummary?.user?.id
  ]);

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

  async function useCloudAfterConflict() {
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
    setCloudBackupStatus("Cloud backup restored locally.");
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

  const actions = useMemo(() => ({
    updateAppData,
    toggleTheme: () => {
      updateAppData(prev => {
        const currentMode = prev.settings?.themeMode || (prev.settings?.darkModeEnabled ? "dark" : "light");
        const nextMode = currentMode === "dark" ? "light" : "dark";
        return {
          ...prev,
          settings: {
            ...(prev.settings || {}),
            themeMode: nextMode,
            darkModeEnabled: nextMode === "dark"
          }
        };
      }, { reason: "Theme changed", markDirty: false });
    },
    togglePhoneMode: () => setPhoneMode(prev => !prev),
    openAddTransaction: () => {
      setEditingTransaction(null);
      setShowTransactionModal(true);
    },
    openEditTransaction: (transaction) => {
      setEditingTransaction(transaction);
      setShowTransactionModal(true);
    },
    closeTransactionModal: () => {
      setEditingTransaction(null);
      setShowTransactionModal(false);
    },
    backupNow,
    installApp,
    dismissInstallPrompt,
    dismissBackupBanner,
    updateAppFromServiceWorker,
    refreshCloudAuthState,
    cloudBackupNow,
    lockApp,
    logoutApp,
    openLocalAccessMode,
    openSettingsProfile,
    refreshAdminAccess,
    cloudAuthSummary,
    cloudBackupStatus,
    phoneMode,
    cloudUsername: getDisplayUsernameFromSession(cloudAuthSummary),
    featureFlags: getFeatureFlags(appData?.settings),
    adminAccessState,
    adminStatus: getAdminStatus(adminAccessState, cloudAuthSummary),
    pwaInstall: {
      installPrompt,
      installStatus,
      isInstalled,
      isOnline,
      isLocalAccessMode: localAccessUnlocked && !isCloudSessionAllowed(appData?.settings, cloudAuthSummary),
      serviceWorkerReady,
      waitingServiceWorker,
      hasUpdateAvailable: Boolean(waitingServiceWorker)
    },
    setActivePage: navigateToPage,
    preferredSettingsSection,
    selectedMonth,
    setSelectedMonth,
    selectedDashboardAccountId,
    setSelectedDashboardAccountId
  }), [appData, selectedMonth, selectedDashboardAccountId, installPrompt, installStatus, isInstalled, isOnline, serviceWorkerReady, waitingServiceWorker, cloudAuthSummary, cloudBackupStatus, localAccessUnlocked, phoneMode, adminAccessState, preferredSettingsSection]);

  if (storageRecoveryError) {
    return (
      <StorageRecoveryScreen
        error={storageRecoveryError}
        phoneMode={phoneMode}
        onTogglePhoneMode={() => setPhoneMode(prev => !prev)}
        onRestoreBackup={(restoredData) => {
          setStorageRecoveryError(null);
          setAppData(restoredData);
          setAppLoadStatus("");
        }}
        onStartFresh={() => {
          setStorageRecoveryError(null);
          setAppData(getInitialAppData());
          setAppLoadStatus("");
        }}
      />
    );
  }

  if (!appData) {
    return (
      <main className={`loading-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
        <section className="card loading-card">
          <p className="eyebrow">GH Budgeting</p>
          <h1>Loading your budget data</h1>
          <p className="muted-text">{appLoadStatus || "Opening permanent local storage..."}</p>
        </section>
      </main>
    );
  }

  const loginGateRequired = isCloudLoginGateRequired(appData.settings);
  const cloudSessionAllowed = isCloudSessionAllowed(appData.settings, cloudAuthSummary);
  const localAccessAllowed = localAccessUnlocked && hasUsableLocalBudgetData(appData);

  if (loginGateRequired && !cloudSessionAllowed && !localAccessAllowed) {
    return (
      <CloudLoginGate
        appData={appData}
        actions={actions}
        cloudAuthSummary={cloudAuthSummary}
        onAuthChanged={refreshCloudAuthState}
        phoneMode={phoneMode}
        onTogglePhoneMode={() => setPhoneMode(prev => !prev)}
      />
    );
  }

  if (cloudConflict?.cloudData) {
    return (
      <CloudConflictScreen
        appData={appData}
        conflict={cloudConflict}
        onKeepLocal={keepLocalAfterConflict}
        onUseCloud={useCloudAfterConflict}
        onKeepBoth={keepBothAfterConflict}
        onApplyMerge={applyReviewedMerge}
        onDownloadLocal={backupNow}
      />
    );
  }

  if (!appData.settings.hasStarted) {
    return (
      <WelcomeScreen
        onSetup={(profilePatch) => setAppData(prev => {
          const profiledData = applyProfilePatch(prev, profilePatch);
          return {
            ...profiledData,
            settings: { ...profiledData.settings, hasStarted: true, hasCompletedSetup: true, useExampleData: false },
            transactions: profiledData.transactions.filter(item => !item.isExample),
            recurringItems: profiledData.recurringItems.filter(item => !item.isExample),
            savingsGoals: profiledData.savingsGoals.filter(goal => !goal.isExample),
            loans: (profiledData.loans || []).filter(loan => !loan.isExample),
            loanEvents: (profiledData.loanEvents || []).filter(event => !event.isExample)
          };
        })}
        onExplore={(profilePatch) => setAppData(prev => {
          const profiledData = applyProfilePatch(prev, profilePatch);
          return {
            ...profiledData,
            settings: { ...profiledData.settings, hasStarted: true, useExampleData: true }
          };
        })}
        phoneMode={phoneMode}
        onTogglePhoneMode={() => setPhoneMode(prev => !prev)}
      />
    );
  }

  const featureFlags = getFeatureFlags(appData.settings);
  const adminStatus = getAdminStatus(adminAccessState, cloudAuthSummary);
  const visibleActivePage = (
    (activePage === "import" && featureFlags.csvImport === false) ||
    (activePage === "loans" && featureFlags.loans === false)
  ) ? "dashboard" : activePage;
  const CurrentPage = pages[visibleActivePage] || DashboardPage;

  return (
    <AppShell
      activePage={visibleActivePage}
      setActivePage={navigateToPage}
      appData={appData}
      actions={{ ...actions, featureFlags, adminStatus }}
      showTransactionModal={showTransactionModal}
      editingTransaction={editingTransaction}
      quickBackupStatus={quickBackupStatus}
      pwaInstall={actions.pwaInstall}
    >
      <CurrentPage appData={appData} actions={actions} />
    </AppShell>
  );
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
