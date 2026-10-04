import { useEffect, useMemo, useRef, useState } from "react";
import { logError } from "./utils/logger.js";

import AppShell from "./components/layout/AppShell.jsx";
import WelcomeScreen from "./components/setup/WelcomeScreen.jsx";
import CloudLoginGate from "./components/auth/CloudLoginGate.jsx";
import CloudConflictScreen from "./components/auth/CloudConflictScreen.jsx";
import StorageRecoveryScreen from "./components/app/StorageRecoveryScreen.jsx";
import BroadcastMessageModal from "./components/app/BroadcastMessageModal.jsx";
import { BlockedAccountScreen, LoadingScreen, MaintenanceScreen, PausedAccountScreen } from "./components/app/AccountStatusScreens.jsx";
import { DashboardPage, NOT_FOUND_PAGE, NotFoundPage, pages } from "./pages/index.js";

import { getInitialAppData, removeExampleDataFromAppData } from "./data/exampleData.js";
import {
  STORAGE_LOAD_FAILURE_CODE,
  exportJsonBackup,
  loadAppDataAsync,
  markAppDataChanged,
  prepareDataForBackupExport,
  saveAppData,
  updateLocalProfile
} from "./services/storageService.js";
import { processRecurringItems } from "./services/recurringService.js";
import { getMonthKey } from "./utils/dates.js";
import { clearStoredCloudSession, getStoredCloudSessionSummary, isCloudLoginGateRequired, isCloudSessionAllowed } from "./services/cloudBackupService.js";
import { getDisplayUsernameFromSession } from "./services/authService.js";
import { getAdminStatus, getFeatureFlags } from "./services/adminService.js";
import { applyExclusionRules, undoExclusionRuleChanges } from "./services/transactionService.js";
import { isFreshDevice } from "./services/cloudSyncService.js";
import { clearLocalAccessSession, hasUsableLocalBudgetData, isLocalAccessSessionAllowed, storeLocalAccessSession } from "./services/localAccessService.js";

import useAppRouting from "./hooks/useAppRouting.js";
import useAppTheme from "./hooks/useAppTheme.js";
import useDialogManager from "./hooks/useDialogManager.js";
import usePhoneMode from "./hooks/usePhoneMode.js";
import useIsSmallScreen from "./hooks/useIsSmallScreen.js";
import useStatusMessage, { STATUS_ERROR_DURATION_MS } from "./hooks/useStatusMessage.js";
import usePwaInstall from "./hooks/usePwaInstall.js";
import useUndoOffer from "./hooks/useUndoOffer.js";
import useCloudAccount from "./hooks/useCloudAccount.js";
import useCloudSync from "./hooks/useCloudSync.js";

const NARROW_SCREEN_QUERY = "(max-width: 720px)";

export default function App() {
  const [appData, setAppData] = useState(null);
  const [appLoadStatus, setAppLoadStatus] = useState("Loading saved data...");
  const [storageRecoveryError, setStorageRecoveryError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const [selectedDashboardAccountId, setSelectedDashboardAccountId] = useState("all");
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [localAccessUnlocked, setLocalAccessUnlocked] = useState(() => isLocalAccessSessionAllowed());
  // Payment Rules after an import or new transfer: either a prompt to
  // refresh them ({ mode: "prompt", count, trigger }) or the result of an
  // automatic/confirmed refresh ({ mode: "applied", count, changes }) that
  // can be undone.
  const [rulesNotice, setRulesNotice] = useState(null);
  // Latest values for event listeners and code that runs after an await.
  const appDataRef = useRef(null);
  appDataRef.current = appData;

  const [phoneModeChoice, setPhoneMode] = usePhoneMode();
  // Narrow screens always get the compact layout; on wider screens it is the
  // "Phone view" choice from the header.
  const isNarrowScreen = useIsSmallScreen(NARROW_SCREEN_QUERY);
  const phoneMode = phoneModeChoice || isNarrowScreen;
  const routing = useAppRouting();
  const { statusMessage, notify } = useStatusMessage();
  const pwa = usePwaInstall({ hasUnbackedChanges: Boolean(appData?.settings?.hasUnbackedChanges) });
  const { undoOffer, finaliseUndoOffer, updateAppDataWithUndo, undoLastChange } = useUndoOffer({ appData, appDataRef, setAppData });
  const cloudAccount = useCloudAccount(appData);
  const { cloudAuthSummary, setCloudAuthSummary, adminAccessState, appNotices, dismissedBroadcastId } = cloudAccount;
  const cloudSync = useCloudSync({ appData, appDataRef, setAppData, cloudAuthSummary, adminAccessState, backupNow });
  const { cloudBackupStatus, setCloudBackupStatus, cloudStatusRetry, cloudConflict, cloudSyncReady, cloudBackupNow } = cloudSync;
  useAppTheme(appData?.settings);
  useDialogManager();

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
        logError("Failed to load saved app data", error);
        if (!cancelled) {
          if (error?.code === STORAGE_LOAD_FAILURE_CODE) {
            setStorageRecoveryError(error);
            setAppData(null);
            setAppLoadStatus("Saved data could not be loaded safely.");
          } else {
            setStorageRecoveryError(error);
            setAppData(null);
            setAppLoadStatus("Your saved data couldn't be loaded. Use the recovery options below — nothing has been deleted.");
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
    if (params.get("action") === "add-transaction") {
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
    if (!appData?.settings?.hasUnbackedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [appData?.settings?.hasUnbackedChanges]);

  function updateAppData(nextOrUpdater, options = {}) {
    finaliseUndoOffer();
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

  async function backupNow() {
    const exportedAt = new Date().toISOString();
    const { nextData, filename } = prepareDataForBackupExport(appData, exportedAt);

    try {
      const result = await exportJsonBackup(nextData, exportedAt, filename);

      if (!result.ok) {
        if (result.cancelled) {
          notify("Backup cancelled — nothing was saved.");
        }
        return;
      }

      setAppData(nextData);
      notify(result.method === "save-picker" ? "Backup saved." : "Backup downloaded to your Downloads folder.");
    } catch (error) {
      logError("Backup failed", error);
      notify("The backup couldn't be saved. Try again, or choose a different download location.", STATUS_ERROR_DURATION_MS);
    }
  }

  function openLocalAccessMode() {
    if (!hasUsableLocalBudgetData(appData)) {
      setCloudBackupStatus("This device has no saved budget yet, so it can't open offline. Sign in to load your budget.");
      return;
    }
    storeLocalAccessSession();
    setLocalAccessUnlocked(true);
    setCloudBackupStatus("Opened offline on this device. Cloud backup will start again when you sign in.");
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
    updateAppDataWithUndo,
    notify,
    undoOffer,
    undoLastChange,
    dismissUndo: finaliseUndoOffer,
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
    installApp: pwa.installApp,
    dismissInstallPrompt,
    dismissBackupBanner,
    updateAppFromServiceWorker: pwa.updateAppFromServiceWorker,
    refreshCloudAuthState: cloudAccount.refreshCloudAuthState,
    cloudBackupNow,
    lockApp,
    logoutApp,
    openLocalAccessMode,
    openSettingsProfile: routing.openSettingsProfile,
    refreshAdminAccess: cloudAccount.refreshAdminAccess,
    refreshAppNotices: cloudAccount.refreshAppNotices,
    appNotices,
    cloudAuthSummary,
    cloudBackupStatus,
    cloudStatusRetry,
    retryCloudAction: cloudSync.retryCloudAction,
    dismissCloudStatus: cloudSync.dismissCloudStatus,
    phoneMode,
    isNarrowScreen,
    cloudUsername: getDisplayUsernameFromSession(cloudAuthSummary),
    featureFlags: getFeatureFlags(appData?.settings),
    adminAccessState,
    adminStatus: getAdminStatus(adminAccessState, cloudAuthSummary),
    pwaInstall: {
      installPrompt: pwa.installPrompt,
      installStatus: pwa.installStatus,
      isInstalled: pwa.isInstalled,
      isOnline: pwa.isOnline,
      isLocalAccessMode: localAccessUnlocked && !isCloudSessionAllowed(appData?.settings, cloudAuthSummary),
      serviceWorkerReady: pwa.serviceWorkerReady,
      waitingServiceWorker: pwa.waitingServiceWorker,
      hasUpdateAvailable: pwa.hasUpdateAvailable
    },
    setActivePage: routing.navigateToPage,
    preferredSettingsSection: routing.preferredSettingsSection,
    settingsSectionRequestId: routing.settingsSectionRequestId,
    pageIntent: routing.pageIntent,
    clearPageIntent: routing.clearPageIntent,
    selectedMonth,
    setSelectedMonth,
    selectedDashboardAccountId,
    setSelectedDashboardAccountId
  }), [appData, rulesNotice, selectedMonth, selectedDashboardAccountId, pwa, cloudAuthSummary, cloudBackupStatus, localAccessUnlocked, phoneMode, isNarrowScreen, adminAccessState, appNotices, cloudStatusRetry, routing.activePage, routing.preferredSettingsSection, routing.settingsSectionRequestId, routing.pageIntent, undoOffer]);

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
      <LoadingScreen phoneMode={phoneMode} title="Loading your budget data" message={appLoadStatus || "Opening your saved data on this device…"} />
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
        onAuthChanged={cloudAccount.refreshCloudAuthState}
        phoneMode={phoneMode}
        onTogglePhoneMode={() => setPhoneMode(prev => !prev)}
      />
    );
  }

  if (cloudSessionAllowed && !adminAccessState.loaded) {
    return (
      <LoadingScreen phoneMode={phoneMode} title="Checking account access" message="Confirming your account before opening your budget." />
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
      <LoadingScreen phoneMode={phoneMode} title="Loading your latest budget" message="Fetching the newest version from the cloud." />
    );
  }

  if (cloudConflict?.cloudData) {
    return (
      <CloudConflictScreen
        appData={appData}
        conflict={cloudConflict}
        onKeepLocal={cloudSync.keepLocalAfterConflict}
        onUseCloud={cloudSync.chooseCloudAfterConflict}
        onKeepBoth={cloudSync.keepBothAfterConflict}
        onApplyMerge={cloudSync.applyReviewedMerge}
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
    (routing.activePage === "import" && featureFlags.csvImport === false) ||
    (routing.activePage === "loans" && featureFlags.loans === false)
  ) ? "dashboard" : routing.activePage;
  const CurrentPage = visibleActivePage === NOT_FOUND_PAGE ? NotFoundPage : pages[visibleActivePage] || DashboardPage;

  const activeBroadcast = appNotices.broadcast;
  const showBroadcast = Boolean(activeBroadcast && activeBroadcast.id !== dismissedBroadcastId);

  return (
    <>
      <AppShell
        activePage={visibleActivePage}
        setActivePage={routing.navigateToPage}
        appData={appData}
        actions={{ ...actions, featureFlags, adminStatus }}
        showTransactionModal={showTransactionModal}
        editingTransaction={editingTransaction}
        quickBackupStatus={statusMessage}
        pwaInstall={actions.pwaInstall}
      >
        <CurrentPage appData={appData} actions={actions} />
      </AppShell>
      {showBroadcast && (
        <BroadcastMessageModal broadcast={activeBroadcast} onDismiss={() => cloudAccount.dismissBroadcast(activeBroadcast.id)} />
      )}
    </>
  );
}
