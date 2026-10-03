// Status banners shown under the page tabs (backup, sync, storage, updates).
export function BannerStack({ actions, adminStatus, backupButtonLevel, backupReminder, setActivePage, showInstallBanner, showUnbackedBanner, showUpdateBanner }) {
  return (
    <div className="below-tabs-banner-stack">
      {adminStatus.isAdmin && actions.appNotices?.maintenanceMode && (
        <div className="install-app-banner maintenance-banner" role="status" aria-live="polite">
          <div>
            <strong>Maintenance mode is ON</strong>
            <span>Everyone except admins is currently locked out. Turn it off in Control Centre when you're done.</span>
          </div>
          <button className="text-button" onClick={() => setActivePage("control")}>Control Centre</button>
        </div>
      )}

      {showUpdateBanner && (
        <div className="app-update-banner" role="status" aria-live="polite">
          <div>
            <strong>App update available</strong>
            <span>A newer version is ready. Export a backup first if you have unbacked changes, then update the app.</span>
          </div>
          <div className="unbacked-changes-actions">
            <button className="secondary-button small" onClick={actions.backupNow}>Backup now</button>
            <button className="primary-button small" onClick={actions.updateAppFromServiceWorker}>Update app</button>
          </div>
        </div>
      )}

      {showInstallBanner && (
        <div className="install-app-banner" role="status" aria-live="polite">
          <div>
            <strong>Install the app</strong>
            <span>Use GH Budgeting from your desktop or phone home screen. Data still saves locally first; sign in to restore cloud backups between devices.</span>
          </div>
          <div className="unbacked-changes-actions">
            <button className="primary-button small" onClick={actions.installApp}>Install app</button>
            <button className="text-button" onClick={actions.dismissInstallPrompt}>Not now</button>
          </div>
        </div>
      )}

      {actions.undoOffer && (
        <div className="unbacked-changes-banner backup-banner-notice undo-banner" role="status" aria-live="polite">
          <div>
            <strong>{actions.undoOffer.message}</strong>
          </div>
          <div className="unbacked-changes-actions">
            <button type="button" className="secondary-button small" onClick={actions.undoLastChange}>Undo</button>
            <button type="button" className="text-button" onClick={actions.dismissUndo}>Dismiss</button>
          </div>
        </div>
      )}

      {actions.rulesNotice && (
        <div className="unbacked-changes-banner backup-banner-notice rules-refresh-banner" role="status" aria-live="polite">
          {actions.rulesNotice.mode === "prompt" ? (
            <>
              <div>
                <strong>Refresh your payment rules?</strong>
                <span>
                  {actions.rulesNotice.trigger === "transfer" ? "After this transfer" : "After this import"}, your Payment Rules would update {actions.rulesNotice.count} transaction{actions.rulesNotice.count === 1 ? "" : "s"} (excluding them from totals, budgets or charts as each rule says).
                </span>
              </div>
              <div className="unbacked-changes-actions">
                <button className="secondary-button small" onClick={actions.refreshPaymentRulesNow}>Refresh rules</button>
                <button className="text-button" onClick={actions.dismissRulesNotice}>Not now</button>
                <button className="text-button" onClick={() => { actions.dismissRulesNotice(); setActivePage("settings"); }}>Rule settings</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <strong>{actions.rulesNotice.count > 0 ? "Payment rules refreshed" : "Payment rules are up to date"}</strong>
                <span>
                  {actions.rulesNotice.count > 0
                    ? `${actions.rulesNotice.auto ? "Refreshed automatically — " : ""}${actions.rulesNotice.count} transaction${actions.rulesNotice.count === 1 ? "" : "s"} updated.`
                    : "Nothing needed changing."}
                </span>
              </div>
              <div className="unbacked-changes-actions">
                {actions.rulesNotice.changes?.length > 0 && <button className="secondary-button small" onClick={actions.undoPaymentRulesRefresh}>Undo</button>}
                <button className="text-button" onClick={actions.dismissRulesNotice}>Dismiss</button>
              </div>
            </>
          )}
        </div>
      )}

      {showUnbackedBanner && (
        <div className={`unbacked-changes-banner backup-banner-${backupButtonLevel}`} role="status" aria-live="polite">
          <div>
            <strong>{backupReminder.title}</strong>
            <span>{backupReminder.message} Browsers can warn before closing, but backup export should be done before you close the app.</span>
          </div>
          <div className="unbacked-changes-actions">
            <button className="secondary-button small" onClick={actions.backupNow}>Backup now</button>
            <button className="text-button" onClick={actions.dismissBackupBanner}>Not now</button>
            <button className="text-button" onClick={() => setActivePage("settings")}>Backup settings</button>
          </div>
        </div>
      )}
    </div>
  );
}
