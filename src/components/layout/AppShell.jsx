import TopNav from "./TopNav.jsx";
import TransactionModal from "../transactions/TransactionModal.jsx";

export default function AppShell({
  children,
  activePage,
  setActivePage,
  appData,
  actions,
  showTransactionModal,
  editingTransaction,
  quickBackupStatus
}) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" onClick={() => setActivePage("dashboard")} role="button" tabIndex={0}>
          <div className="brand-icon"><img src="/icons/gb-icon-192.png" alt="" /></div>
          <div>
            <h1>Guinness Budgeting</h1>
            <p>Local budgeting dashboard</p>
          </div>
        </div>

        <div className="header-actions">
          <button className="secondary-button backup-now-button" onClick={actions.backupNow}>
            Backup Now
          </button>
          <button className="primary-button" onClick={actions.openAddTransaction}>
            + Add Transaction
          </button>
        </div>
      </header>

      {quickBackupStatus && (
        <div className="quick-backup-status" role="status" aria-live="polite">
          {quickBackupStatus}
        </div>
      )}

      <TopNav activePage={activePage} setActivePage={setActivePage} />

      <main className="page-content">{children}</main>

      {showTransactionModal && (
        <TransactionModal
          appData={appData}
          actions={actions}
          editingTransaction={editingTransaction}
        />
      )}
    </div>
  );
}
