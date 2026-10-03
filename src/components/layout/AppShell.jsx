import { useMemo, useState } from "react";
import TopNav from "./TopNav.jsx";
import TransactionModal from "../transactions/TransactionModal.jsx";
import InlineQrCode from "../common/InlineQrCode.jsx";
import { getBackupReminder } from "../../services/storageService.js";
import { buildAppNotifications } from "../../utils/notifications.js";
import { CommandIcon, HeaderIconButton, LaptopIcon, MoonIcon, PhoneIcon, QrCodeIcon, SearchIcon, SunIcon } from "./HeaderIcons.jsx";
import { buildSearchResults } from "../../utils/appSearch.js";
import { resolveDeviceShareUrl } from "../../utils/shareUrl.js";

export default function AppShell({
  children,
  activePage,
  setActivePage,
  appData,
  actions,
  showTransactionModal,
  editingTransaction,
  quickBackupStatus,
  pwaInstall
}) {
  const settings = appData.settings || {};
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDeviceShare, setShowDeviceShare] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shareCopyStatus, setShareCopyStatus] = useState("");
  const notifications = useMemo(() => buildAppNotifications(appData), [appData]);
  const searchResults = useMemo(() => buildSearchResults(appData, searchQuery), [appData, searchQuery]);
  const notificationCount = notifications.length;
  const backupReminder = getBackupReminder(settings);
  const hasUnbackedChanges = Boolean(settings.hasUnbackedChanges);
  const lastDataChangedTime = settings.lastDataChangedAt ? new Date(settings.lastDataChangedAt).getTime() : 0;
  const backupBannerDismissedTime = settings.backupBannerDismissedAt ? new Date(settings.backupBannerDismissedAt).getTime() : 0;
  const featureFlags = actions.featureFlags || {};
  const adminStatus = actions.adminStatus || {};
  const isBackupBannerDismissedForCurrentChange = hasUnbackedChanges && backupBannerDismissedTime >= lastDataChangedTime;
  const showUnbackedBanner = featureFlags.backupReminders !== false && settings.backupWarningsEnabled !== false && hasUnbackedChanges && !isBackupBannerDismissedForCurrentChange;
  const backupButtonLevel = backupReminder.level || "ok";
  const backupButtonCanFlash = settings.backupButtonFlashEnabled !== false;
  const backupButtonShouldFlash = backupButtonCanFlash && backupButtonLevel === "danger";
  const backupButtonClassName = [
    "secondary-button",
    "backup-now-button",
    `backup-level-${backupButtonLevel}`,
    backupButtonShouldFlash ? "is-flashing" : ""
  ].filter(Boolean).join(" ");
  const themeMode = settings.themeMode || (settings.darkModeEnabled ? "dark" : "light");
  const themeLabel = themeMode === "dark" ? "Light mode" : "Dark mode";
  const connectionLabel = pwaInstall?.isLocalAccessMode ? "Local mode" : pwaInstall?.isOnline ? "Online" : "Offline";
  const connectionClass = pwaInstall?.isLocalAccessMode ? "connection-pill local-mode" : pwaInstall?.isOnline ? "connection-pill online" : "connection-pill offline";
  const profileName = appData.profile?.displayName || appData.profile?.username || "Local user";
  const showHeaderBackupButton = backupButtonLevel === "danger" && settings.backupWarningsEnabled !== false;
  const showInstallBanner = Boolean(
    pwaInstall?.installPrompt
    && !pwaInstall?.isInstalled
    && !appData.settings?.pwaInstallPromptDismissedAt
  );
  const showUpdateBanner = Boolean(pwaInstall?.hasUpdateAvailable);
  const deviceShare = resolveDeviceShareUrl();
  const shareUrl = deviceShare.url;

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyStatus("Link copied.");
    } catch {
      setShareCopyStatus("Couldn't copy the link. Select it in the box above and copy it by hand.");
    }
    window.setTimeout(() => setShareCopyStatus(""), 2500);
  }

  return (
    <div className={`app-shell ${actions.phoneMode ? "phone-mode" : ""}`.trim()}>
      <div className="app-fixed-area">
        <header className="app-header">
          <button type="button" className="brand" onClick={() => setActivePage("dashboard")} title="Go to dashboard">
            <span className="brand-icon"><img src="/icons/gb-icon-192.png" alt="" /></span>
            <span className="brand-text">
              <span className="brand-name">Guinness & Holley Budgeting</span>
              <span className="brand-subtitle">
                <span>Welcome back, {profileName}</span>
                <span className={connectionClass}>{connectionLabel}</span>
              </span>
            </span>
          </button>

          <div className="header-actions">
            <span className={`${connectionClass} header-connection-pill`}>{connectionLabel}</span>
            <div className="header-icon-row">
            <HeaderIconButton
              label={themeLabel}
              title={themeLabel}
              onClick={actions.toggleTheme}
            >
              {themeMode === "dark" ? <SunIcon /> : <MoonIcon />}
            </HeaderIconButton>
            <HeaderIconButton
              label={actions.phoneMode ? "Desktop view" : "Phone view"}
              title={actions.phoneMode ? "Return to desktop layout" : "Use compact phone-friendly layout"}
              active={actions.phoneMode}
              onClick={actions.togglePhoneMode}
            >
              {actions.phoneMode ? <LaptopIcon /> : <PhoneIcon />}
            </HeaderIconButton>
            <HeaderIconButton
              label="Global search"
              title="Search app data"
              active={showSearch}
              onClick={() => setShowSearch(prev => !prev)}
            >
              <SearchIcon />
            </HeaderIconButton>
            <HeaderIconButton
              label="Quick actions"
              title="Quick actions"
              active={showQuickActions}
              onClick={() => setShowQuickActions(prev => !prev)}
            >
              <CommandIcon />
            </HeaderIconButton>

            {featureFlags.qrPhoneAccess !== false && (
            <div className="device-share-wrapper">
              <HeaderIconButton
                label="Open QR code to open app on phone"
                title="Open QR code to open app on phone"
                active={showDeviceShare}
                onClick={() => setShowDeviceShare(prev => !prev)}
              >
                <QrCodeIcon />
              </HeaderIconButton>
              {showDeviceShare && (
                <div className="device-share-panel" role="dialog" aria-label="Open app on another device">
                  <div className="notification-panel-header">
                    <strong>Open on phone</strong>
                    <button type="button" className="text-button" onClick={() => setShowDeviceShare(false)}>Close</button>
                  </div>
                  <p className="muted">Scan this QR code on your phone, then sign in and restore the latest cloud backup if this device has newer data.</p>
                  {shareUrl ? (
                    <div className="device-qr-card">
                      <InlineQrCode value={shareUrl} size={280} />
                    </div>
                  ) : (
                    <div className="cloud-status-message compact-status warning-status">
                      A valid app link could not be found. Set VITE_PUBLIC_APP_URL to the public production Vercel app link.
                    </div>
                  )}
                  {deviceShare.needsDeployedUrl && shareUrl && (
                    <div className="cloud-status-message compact-status warning-status">
                      {deviceShare.isPreviewRuntime
                        ? "This looks like a Vercel preview/dashboard URL, so the QR uses the stable production app link."
                        : deviceShare.isLocalRuntime || deviceShare.isPrivateRuntime
                          ? "You are running locally or on a private URL, so the QR uses the stable production app link."
                          : "Test the phone QR from the stable production app URL."}
                    </div>
                  )}
                  {!deviceShare.isLocalRuntime && deviceShare.usingConfiguredUrl && (
                    <div className="cloud-status-message compact-status">
                      This QR uses the configured stable production URL, so phones avoid preview deployments and Vercel dashboard links.
                    </div>
                  )}
                  <input className="device-share-link" value={shareUrl} readOnly aria-label="App link" />
                  <div className="row-actions cloud-action-row">
                    <button type="button" className="secondary-button small" onClick={copyShareLink} disabled={!shareUrl}>Copy link</button>
                    {shareUrl && <a className="secondary-button small" href={shareUrl} target="_blank" rel="noreferrer">Open link</a>}
                  </div>
                  {shareCopyStatus && <p className="cloud-status-message compact-status">{shareCopyStatus}</p>}
                </div>
              )}
            </div>
            )}

            <HeaderIconButton
              label="Reports"
              title="Reports"
              active={activePage === "reports"}
              onClick={() => setActivePage("reports")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M7 3h7l4 4v14H7V3Z" />
                <path d="M14 3v5h5" />
                <path d="M9 13h6" />
                <path d="M9 17h6" />
                <path d="M9 9h2" />
              </svg>
            </HeaderIconButton>

            {featureFlags.csvImport !== false && (
              <HeaderIconButton
                label="Import and export"
                title="Import / export data"
                active={activePage === "import"}
                onClick={() => setActivePage("import")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 3v11" />
                  <path d="m8 10 4 4 4-4" />
                  <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  <path d="M5 7h3" />
                  <path d="M16 7h3" />
                </svg>
              </HeaderIconButton>
            )}

            <div className="notification-wrapper">
              <button
                type="button"
                className={`notification-button ${notificationCount > 0 ? "has-notifications" : ""}`}
                onClick={() => setShowNotifications(prev => !prev)}
                aria-label={`Notifications${notificationCount ? `, ${notificationCount} active` : ""}`}
                title="Notifications"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {notificationCount > 0 && <span className="notification-count">{notificationCount > 9 ? "9+" : notificationCount}</span>}
              </button>
              {showNotifications && (
                <div className="notification-panel" role="dialog" aria-label="Notifications">
                  <div className="notification-panel-header">
                    <strong>Notifications</strong>
                    <button type="button" className="text-button" onClick={() => setShowNotifications(false)}>Close</button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="muted">No upcoming bill warnings right now.</p>
                  ) : (
                    <div className="notification-list">
                      {notifications.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          className={`notification-row ${item.type}`}
                          onClick={() => {
                            setShowNotifications(false);
                            if (item.actionPage) setActivePage(item.actionPage);
                          }}
                        >
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.message}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <HeaderIconButton
              label="Settings"
              title="Settings"
              active={activePage === "settings"}
              onClick={() => setActivePage("settings")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 0 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.08a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1H2.86a2.1 2.1 0 0 1 0-4.2h.08A1.8 1.8 0 0 0 4.6 8.6a1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.1 2.1 0 0 1 7.16 3.6l.05.05a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.3 2.35V2.1a2.1 2.1 0 0 1 4.2 0v.08A1.8 1.8 0 0 0 15.6 3.84a1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.66 1.1h.08a2.1 2.1 0 0 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" />
              </svg>
            </HeaderIconButton>
            </div>

            {showHeaderBackupButton && (
              <button className={backupButtonClassName} onClick={actions.backupNow} title={backupReminder.message}>
                Backup Now
              </button>
            )}
            <button className="primary-button" onClick={actions.openAddTransaction}>
              + Add Transaction
            </button>
          </div>
        </header>

        {showSearch && (
          <div className="command-panel" role="dialog" aria-label="Global search">
            <div className="notification-panel-header">
              <strong>Search</strong>
              <button type="button" className="text-button" onClick={() => setShowSearch(false)}>Close</button>
            </div>
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search transactions, accounts, bills, houses..."
              aria-label="Search query"
              autoFocus
            />
            <div className="notification-list">
              {searchResults.length === 0 ? (
                <p className="muted">No results yet.</p>
              ) : searchResults.map((item, index) => (
                <button
                  type="button"
                  key={`${item.type}-${item.label}-${index}`}
                  className="notification-row notice"
                  onClick={() => {
                    setShowSearch(false);
                    setActivePage(item.page);
                  }}
                >
                  <span>
                    <strong>{item.type}: {item.label}</strong>
                    <small>{item.detail || item.page}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showQuickActions && (
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
        )}

        {quickBackupStatus && (
          <div className="quick-backup-status" role="status" aria-live="polite">
            {quickBackupStatus}
          </div>
        )}
        {actions.cloudBackupStatus && (
          <div className={`quick-backup-status ${actions.cloudStatusRetry ? "has-actions" : ""}`.trim()} role="status" aria-live="polite">
            <span>{actions.cloudBackupStatus}</span>
            {actions.cloudStatusRetry && (
              <span className="row-actions">
                <button type="button" className="secondary-button small" onClick={actions.retryCloudAction}>Try again</button>
                <button type="button" className="text-button" onClick={actions.dismissCloudStatus}>Dismiss</button>
              </span>
            )}
          </div>
        )}

        <TopNav
          activePage={activePage}
          setActivePage={setActivePage}
          accounts={appData.accounts || []}
          selectedDashboardAccountId={actions.selectedDashboardAccountId || "all"}
          setSelectedDashboardAccountId={actions.setSelectedDashboardAccountId}
          featureFlags={featureFlags}
          isAdmin={adminStatus.isAdmin}
        />

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
      </div>

      <main className="page-content app-scroll-area">{children}</main>

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
