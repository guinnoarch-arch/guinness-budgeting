import React, { useEffect, useMemo, useRef, useState } from "react";
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

import { getInitialAppData, removeExampleDataFromAppData } from "./data/exampleData.js";
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
  fetchLatestSupabaseCloudBackupMeta,
  fetchSupabaseCloudBackup,
  getStoredCloudSessionSummary,
  isCloudBackupConfigured,
  isCloudLoginGateRequired,
  isCloudSessionAllowed,
  refreshSupabaseCloudSession,
  uploadSupabaseCloudBackup
} from "./services/cloudBackupService.js";
import { getDisplayUsernameFromSession } from "./services/authService.js";
import { ADMIN_ROUTE_PATH, DEFAULT_ADMIN_ACCESS_STATE, DEFAULT_APP_NOTICES, fetchAdminAccessState, getAdminStatus, getAppNotices, getFeatureFlags } from "./services/adminService.js";
import { buildDataFingerprint } from "./services/cloudMergeService.js";
import { applyExclusionRules, undoExclusionRuleChanges } from "./services/transactionService.js";
import {
  SYNC_SAFETY_BACKUP_TYPE,
  applyCloudDataForSync,
  decideCloudSync,
  describeSyncTime,
  isFreshDevice
} from "./services/cloudSyncService.js";
import { clearLocalAccessSession, hasUsableLocalBudgetData, isLocalAccessSessionAllowed, storeLocalAccessSession } from "./services/localAccessService.js";


const PHONE_MODE_STORAGE_KEY = "ghBudgetingPhoneMode";
const DISMISSED_BROADCAST_STORAGE_KEY = "ghBudgetingDismissedBroadcastId";

function readStoredPhoneMode() {
  try {
    return window.localStorage.getItem(PHONE_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredDismissedBroadcastId() {
  try {
    return window.localStorage.getItem(DISMISSED_BROADCAST_STORAGE_KEY) || "";
  } catch {
    return "";
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

function BlockedAccountScreen({ phoneMode, onLogout }) {
  return (
    <main className={`blocked-account-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card blocked-account-card">
        <p className="eyebrow">Account blocked</p>
        <h1>Your account has been blocked. Contact the app admin.</h1>
        <p className="muted-text">
          Blocking is access control only. This app has not deleted local browser data, backups, or budget records.
        </p>
        <button type="button" className="primary-button" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}

function PausedAccountScreen({ phoneMode, onLogout }) {
  return (
    <main className={`blocked-account-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card blocked-account-card">
        <p className="eyebrow">Account paused</p>
        <h1>Your account access has been paused by the app admin.</h1>
        <p className="muted-text">
          This is temporary, not a block - contact the admin to resume. Local browser data, backups, and budget records have not been touched.
        </p>
        <button type="button" className="primary-button" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}

function MaintenanceScreen({ phoneMode, message, onLogout }) {
  return (
    <main className={`blocked-account-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card blocked-account-card">
        <p className="eyebrow">Under maintenance</p>
        <h1>The app is temporarily unavailable while the admin makes changes.</h1>
        <p className="muted-text">
          {message || "This shouldn't take long. Your local data is safe either way."}
        </p>
        <button type="button" className="secondary-button" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}

const BROADCAST_SEVERITY_LABEL = { info: "Message from the admin", warning: "Notice from the admin", urgent: "Urgent notice from the admin" };

function BroadcastMessageModal({ broadcast, onDismiss }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal-card broadcast-message-modal broadcast-${broadcast.severity || "info"}`}>
        <div className="section-header">
          <h2>{BROADCAST_SEVERITY_LABEL[broadcast.severity] || BROADCAST_SEVERITY_LABEL.info}</h2>
          <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss">×</button>
        </div>
        <p>{broadcast.message}</p>
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onDismiss}>Got it</button>
        </div>
      </div>
    </div>
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
  const [appNotices, setAppNotices] = useState(DEFAULT_APP_NOTICES);
  const [dismissedBroadcastId, setDismissedBroadcastId] = useState(readStoredDismissedBroadcastId);
  // Device sync: false until the first "is the cloud newer?" check has run
  // (or isn't applicable), so nothing uploads this device's copy before
  // we know it isn't an older version.
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  // Payment Rules after an import or new transfer: either a prompt to
  // refresh them ({ mode: "prompt", count, trigger }) or the result of an
  // automatic/confirmed refresh ({ mode: "applied", count, changes }) that
  // can be undone.
  const [rulesNotice, setRulesNotice] = useState(null);
  // Latest values for event listeners and code that runs after an await.
  const appDataRef = useRef(null);
  appDataRef.current = appData;
  const cloudSyncReadyRef = useRef(false);
  cloudSyncReadyRef.current = cloudSyncReady;
  const syncInFlightRef = useRef(false);
  const lastSyncCheckRef = useRef(0);
  const syncWithCloudRef = useRef(null);
  const cloudBackupNowRef = useRef(null);

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
    // A CSV import or a new transfer (options.rulesTrigger) brings in
    // transactions the Payment Rules haven't seen. If refreshing them would
    // change anything, either do it now (Settings > Payment Rules >
    // "refresh automatically") or offer it in a banner.
    if (options.rulesTrigger && nextOrUpdater && typeof nextOrUpdater !== "function") {
      const trial = applyExclusionRules(nextOrUpdater);
      if (trial.updatedCount > 0) {
        if (nextOrUpdater.settings?.autoRefreshPaymentRules) {
          nextOrUpdater = trial.data;
          setRulesNotice({ mode: "applied", auto: true, trigger: options.rulesTrigger, count: trial.updatedCount, changes: trial.changes });
        } else {
          setRulesNotice({ mode: "prompt", trigger: options.rulesTrigger, count: trial.updatedCount });
        }
      }
    }
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
    const appData = appDataRef.current;
    if (!appData) return null;
    if (adminAccessState.loaded && adminAccessState.isBlocked) {
      setCloudBackupStatus("Your account has been blocked. Contact the app admin.");
      return null;
    }
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

  cloudBackupNowRef.current = cloudBackupNow;

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
    }, 20000);
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
        if (Math.abs(cloudTime - localTime) <= 30000) return;
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
          } catch (error) {
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
      console.warn(`Cloud sync check (${trigger}) failed:`, error);
      setCloudBackupStatus(error.message || "Could not check the cloud for a newer version");
      window.setTimeout(() => setCloudBackupStatus(""), 6000);
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
        if (Date.now() - lastSyncCheckRef.current > 30000) syncWithCloudRef.current?.("resume");
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
    const timer = window.setInterval(poll, 60000);
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

  function refreshPaymentRulesNow() {
    const current = appDataRef.current;
    if (!current) return;
    const result = applyExclusionRules(current);
    if (result.updatedCount > 0) updateAppData(result.data, { reason: "Payment rules refreshed" });
    setRulesNotice({ mode: "applied", auto: false, count: result.updatedCount, changes: result.changes });
  }

  function undoPaymentRulesRefresh() {
    if (!rulesNotice?.changes?.length || !appDataRef.current) return;
    updateAppData(undoExclusionRuleChanges(appDataRef.current, rulesNotice.changes), { reason: "Payment rules refresh undone" });
    setRulesNotice(null);
  }

  const actions = useMemo(() => ({
    updateAppData,
    rulesNotice,
    refreshPaymentRulesNow,
    undoPaymentRulesRefresh,
    dismissRulesNotice: () => setRulesNotice(null),
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
    refreshAppNotices,
    appNotices,
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
  }), [appData, rulesNotice, selectedMonth, selectedDashboardAccountId, installPrompt, installStatus, isInstalled, isOnline, serviceWorkerReady, waitingServiceWorker, cloudAuthSummary, cloudBackupStatus, localAccessUnlocked, phoneMode, adminAccessState, appNotices, preferredSettingsSection]);

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
  const signedInBlocked = cloudSessionAllowed && adminAccessState.loaded && adminAccessState.isBlocked;
  // Blocked takes precedence when (unusually) both are true - it's the more
  // permanent state, and the one message a user should see first.
  const signedInPaused = cloudSessionAllowed && adminAccessState.loaded && adminAccessState.isPaused && !adminAccessState.isBlocked;
  // Maintenance mode only gates cloud-connected sessions - a local-access-only
  // user isn't touching anything the admin's server-side changes could
  // break, so there's nothing to protect them from by locking them out too.
  // Admins bypass it so they're the ones who can turn it back off.
  const maintenanceBlocking = cloudSessionAllowed && appNotices.maintenanceMode && !adminAccessState.isAdmin;

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

  if (cloudSessionAllowed && !adminAccessState.loaded) {
    return (
      <main className={`loading-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
        <section className="card loading-card">
          <p className="eyebrow">GH Budgeting</p>
          <h1>Checking account access</h1>
          <p className="muted-text">Confirming your Supabase profile access before opening budget data.</p>
        </section>
      </main>
    );
  }

  if (signedInBlocked) {
    return <BlockedAccountScreen phoneMode={phoneMode} onLogout={logoutApp} />;
  }

  if (signedInPaused) {
    return <PausedAccountScreen phoneMode={phoneMode} onLogout={logoutApp} />;
  }

  if (maintenanceBlocking) {
    return <MaintenanceScreen phoneMode={phoneMode} message={appNotices.maintenanceMessage} onLogout={logoutApp} />;
  }

  if (cloudSessionAllowed && !cloudSyncReady && isFreshDevice(appData)) {
    return (
      <main className={`loading-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
        <section className="card loading-card">
          <p className="eyebrow">GH Budgeting</p>
          <h1>Loading your latest budget</h1>
          <p className="muted-text">Fetching the newest version from the cloud.</p>
        </section>
      </main>
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
          return removeExampleDataFromAppData({
            ...profiledData,
            settings: { ...profiledData.settings, hasStarted: true, hasCompletedSetup: true, useExampleData: false }
          });
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

  const activeBroadcast = appNotices.broadcast;
  const showBroadcast = Boolean(activeBroadcast && activeBroadcast.id !== dismissedBroadcastId);

  return (
    <>
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
      {showBroadcast && (
        <BroadcastMessageModal broadcast={activeBroadcast} onDismiss={() => dismissBroadcast(activeBroadcast.id)} />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
