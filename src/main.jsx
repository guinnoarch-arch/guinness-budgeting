import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";

import AppShell from "./components/layout/AppShell.jsx";
import WelcomeScreen from "./components/setup/WelcomeScreen.jsx";

import DashboardPage from "./pages/DashboardPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import BudgetsPage from "./pages/BudgetsPage.jsx";
import BillsPage from "./pages/BillsPage.jsx";
import SavingsPage from "./pages/SavingsPage.jsx";
import AccountsPage from "./pages/AccountsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

import { getInitialAppData } from "./data/exampleData.js";
import { exportJsonBackup, loadAppData, prepareDataForBackupExport, saveAppData } from "./services/storageService.js";
import { processRecurringItems } from "./services/recurringService.js";
import { getMonthKey } from "./utils/dates.js";
import { registerAppServiceWorker } from "./services/pwaService.js";

const pages = {
  dashboard: DashboardPage,
  transactions: TransactionsPage,
  budgets: BudgetsPage,
  bills: BillsPage,
  savings: SavingsPage,
  accounts: AccountsPage,
  reports: ReportsPage,
  import: ImportPage,
  settings: SettingsPage
};

function App() {
  const [appData, setAppData] = useState(() => loadAppData() || getInitialAppData());
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date()));
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [quickBackupStatus, setQuickBackupStatus] = useState("");

  useEffect(() => {
    const processed = processRecurringItems(appData);
    if (processed.changed) {
      setAppData(processed.data);
    }
    // Only run on first app load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveAppData(appData);
  }, [appData]);


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

  const actions = useMemo(() => ({
    updateAppData: setAppData,
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
    setActivePage,
    selectedMonth,
    setSelectedMonth
  }), [appData, selectedMonth]);

  const CurrentPage = pages[activePage] || DashboardPage;

  if (!appData.settings.hasStarted) {
    return (
      <WelcomeScreen
        onSetup={() => setAppData(prev => ({
          ...prev,
          settings: { ...prev.settings, hasStarted: true, hasCompletedSetup: true, useExampleData: false },
          transactions: [],
          recurringItems: prev.recurringItems.filter(item => !item.isExample),
          savingsGoals: prev.savingsGoals.filter(goal => !goal.isExample)
        }))}
        onExplore={() => setAppData(prev => ({
          ...prev,
          settings: { ...prev.settings, hasStarted: true, useExampleData: true }
        }))}
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
    >
      <CurrentPage appData={appData} actions={actions} />
    </AppShell>
  );
}

registerAppServiceWorker();

createRoot(document.getElementById("root")).render(<App />);
