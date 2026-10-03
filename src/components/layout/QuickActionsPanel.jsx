// Shortcuts to common tasks from the header.
export function QuickActionsPanel({ actions, setActivePage, setShowQuickActions }) {
  return (
    <div className="command-panel quick-action-panel" role="dialog" aria-label="Quick actions">
      <div className="notification-panel-header">
        <strong>Quick actions</strong>
        <button type="button" className="text-button" onClick={() => setShowQuickActions(false)}>Close</button>
      </div>
      <div className="quick-action-grid">
        {[
          ["Add transaction", () => actions.openAddTransaction()],
          ["Export backup", () => actions.backupNow()],
          ["CSV import", () => setActivePage("import")],
          ["Profile", () => setActivePage("settings", { settingsSection: "profile" })],
          ["App health check", () => setActivePage("settings", { settingsSection: "health" })],
          ["Close month", () => setActivePage("settings", { settingsSection: "monthClose" })],
          ["Add bill", () => setActivePage("bills", { intent: "add-bill" })],
          ["House and loans", () => setActivePage("loans")]
        ].map(([label, handler]) => (
          <button key={label} type="button" className="secondary-button" onClick={() => { setShowQuickActions(false); handler(); }}>{label}</button>
        ))}
      </div>
    </div>
  );
}
