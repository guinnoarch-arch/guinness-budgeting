import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";

import AppShell from "./components/layout/AppShell.jsx";
import ErrorBoundary from "./components/layout/ErrorBoundary.jsx";
import WelcomeScreen from "./components/setup/WelcomeScreen.jsx";
import CloudLoginGate from "./components/auth/CloudLoginGate.jsx";

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

import { getInitialAppData } from "./data/exampleData.js";
import { exportJsonBackup, loadAppDataAsync, markAppDataChanged, prepareDataForBackupExport, saveAppData, updateLocalProfile } from "./services/storageService.js";
import { processRecurringItems } from "./services/recurringService.js";
import { getMonthKey } from "./utils/dates.js";
import { applyServiceWorkerUpdate, isStandaloneDisplayMode, registerAppServiceWorker } from "./services/pwaService.js";
import { getStoredCloudSessionSummary, isCloudLoginGateRequired, isCloudSessionAllowed, refreshSupabaseCloudSession } from "./services/cloudBackupService.js";



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
  settings: SettingsPage
};

function App() {
  const [appData, setAppData] = useState(null);
  const [appLoadStatus, setAppLoadStatus] = useState("Loading saved data...");
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

  useEffect(() => {
    let cancelled = false;

    async function loadSavedData() {
      try {
        const savedData = await loadAppDataAsync();
        if (!cancelled) {
          setAppData(savedData || getInitialAppData());
          setAppLoadStatus("");
        }
      } catch (error) {
        console.error("Failed to load saved app data:", error);
        if (!cancelled) {
          setAppData(getInitialAppData());
          setAppLoadStatus("Storage load failed. Started with example data so you can recover from backup in Settings.");
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

    if (requestedPage && pages[requestedPage]) {
      setActivePage(requestedPage);
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


  useEffect(() => {
    if (!appData || !isCloudLoginGateRequired(appData.settings)) return undefined;

    let cancelled = false;

    async function refreshCloudAuth() {
      const summary = getStoredCloudSessionSummary();
      if (!summary.signedIn || !summary.isExpired) {
        if (!cancelled) setCloudAuthSummary(summary);
        return;
      }

      try {
        await refreshSupabaseCloudSession(appData.settings);
        if (!cancelled) setCloudAuthSummary(getStoredCloudSessionSummary());
      } catch (error) {
        console.warn("Could not refresh Supabase session:", error);
        if (!cancelled) setCloudAuthSummary(getStoredCloudSessionSummary());
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
    setCloudAuthSummary(getStoredCloudSessionSummary());
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
    pwaInstall: {
      installPrompt,
      installStatus,
      isInstalled,
      isOnline,
      serviceWorkerReady,
      waitingServiceWorker,
      hasUpdateAvailable: Boolean(waitingServiceWorker)
    },
    setActivePage,
    selectedMonth,
    setSelectedMonth,
    selectedDashboardAccountId,
    setSelectedDashboardAccountId
  }), [appData, selectedMonth, selectedDashboardAccountId, installPrompt, installStatus, isInstalled, isOnline, serviceWorkerReady, waitingServiceWorker]);

  const CurrentPage = pages[activePage] || DashboardPage;

  if (!appData) {
    return (
      <main className="loading-page">
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

  if (loginGateRequired && !cloudSessionAllowed) {
    return (
      <CloudLoginGate
        appData={appData}
        actions={actions}
        cloudAuthSummary={cloudAuthSummary}
        onAuthChanged={refreshCloudAuthState}
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
      />
    );
  }

  return (
    <AppShell
      activePage={activePage}
      setActivePage={setActivePage}
      appData={appData}
      actions={actions}
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
