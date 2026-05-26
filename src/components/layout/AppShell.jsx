import { useMemo, useState } from "react";
import TopNav from "./TopNav.jsx";
import TransactionModal from "../transactions/TransactionModal.jsx";
import InlineQrCode from "../common/InlineQrCode.jsx";
import { getBackupReminder } from "../../services/storageService.js";
import { buildAppNotifications } from "../../utils/notifications.js";

function HeaderIconButton({ label, title, active = false, onClick, children }) {
  return (
    <button
      type="button"
      className={`notification-button header-icon-button ${active ? "active" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={title || label}
    >
      {children}
    </button>
  );
}

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
  const [shareCopyStatus, setShareCopyStatus] = useState("");
  const notifications = useMemo(() => buildAppNotifications(appData), [appData]);
  const notificationCount = notifications.length;
  const backupReminder = getBackupReminder(settings);
  const hasUnbackedChanges = Boolean(settings.hasUnbackedChanges);
  const lastDataChangedTime = settings.lastDataChangedAt ? new Date(settings.lastDataChangedAt).getTime() : 0;
  const backupBannerDismissedTime = settings.backupBannerDismissedAt ? new Date(settings.backupBannerDismissedAt).getTime() : 0;
  const isBackupBannerDismissedForCurrentChange = hasUnbackedChanges && backupBannerDismissedTime >= lastDataChangedTime;
  const showUnbackedBanner = hasUnbackedChanges && !isBackupBannerDismissedForCurrentChange;
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
  const profileName = appData.profile?.displayName || appData.profile?.username || "Local user";
  const showInstallBanner = Boolean(
    pwaInstall?.installPrompt
    && !pwaInstall?.isInstalled
    && !appData.settings?.pwaInstallPromptDismissedAt
  );
  const showUpdateBanner = Boolean(pwaInstall?.hasUpdateAvailable);
  const runtimeUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
  const configuredPublicUrl = import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_APP_PUBLIC_URL || "";
  const isLocalRuntime = typeof window !== "undefined" && ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
  const shareUrl = isLocalRuntime && configuredPublicUrl ? configuredPublicUrl : runtimeUrl;
  const shareUrlIsLocal = Boolean(shareUrl && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(shareUrl));

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      setShareCopyStatus("Link copied");
    } catch {
      setShareCopyStatus("Could not copy link");
    }
    window.setTimeout(() => setShareCopyStatus(""), 2500);
  }

  return (
    <div className="app-shell">
      <div className="app-fixed-area">
        <header className="app-header">
          <div className="brand" onClick={() => setActivePage("dashboard")} role="button" tabIndex={0}>
            <div className="brand-icon"><img src="/icons/gb-icon-192.png" alt="" /></div>
            <div>
              <h1>Guinness & Holley Budgeting</h1>
              <p>Welcome back, {profileName}</p>
            </div>
          </div>

          <div className="header-actions">
            <span className={pwaInstall?.isLocalAccessMode ? "connection-pill local-mode" : pwaInstall?.isOnline ? "connection-pill online" : "connection-pill offline"}>
              {pwaInstall?.isLocalAccessMode ? "Local mode" : pwaInstall?.isOnline ? "Online" : "Offline"}
            </span>
            <button className="secondary-button theme-toggle-button" onClick={actions.toggleTheme}>
              {themeLabel}
            </button>

            <div className="device-share-wrapper">
              <HeaderIconButton
                label="Open on phone"
                title="Open this app on another device"
                active={showDeviceShare}
                onClick={() => setShowDeviceShare(prev => !prev)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
                  <path d="M10 5h4" />
                  <path d="M11 18.5h2" />
                </svg>
              </HeaderIconButton>
              {showDeviceShare && (
                <div className="device-share-panel" role="dialog" aria-label="Open app on another device">
                  <div className="notification-panel-header">
                    <strong>Open on phone</strong>
                    <button type="button" className="text-button" onClick={() => setShowDeviceShare(false)}>Close</button>
                  </div>
                  <p className="muted">Scan this QR code on your phone, then sign in and restore the latest cloud backup.</p>
                  {shareUrl ? (
                    <div className="device-qr-card">
                      <InlineQrCode value={shareUrl} size={220} />
                    </div>
                  ) : (
                    <p className="muted">App link is not available in this browser.</p>
                  )}
                  {shareUrlIsLocal && (
                    <div className="cloud-status-message compact-status warning-status">
                      This QR code points to a local development address. A phone usually cannot open localhost. Deploy to Vercel or set VITE_PUBLIC_APP_URL to your live app link.
                    </div>
                  )}
                  <input className="device-share-link" value={shareUrl} readOnly aria-label="App link" />
                  <div className="row-actions cloud-action-row">
                    <button type="button" className="secondary-button small" onClick={copyShareLink}>Copy link</button>
                    <a className="secondary-button small" href={shareUrl} target="_blank" rel="noreferrer">Open link</a>
                  </div>
                  {shareCopyStatus && <p className="cloud-status-message compact-status">{shareCopyStatus}</p>}
                </div>
              )}
            </div>

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

            <button className={backupButtonClassName} onClick={actions.backupNow} title={backupReminder.message}>
              Backup Now
            </button>
            <button className="secondary-button" onClick={actions.logoutApp} title="Back up if needed, then sign out">
              Logout
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
        {actions.cloudBackupStatus && (
          <div className="quick-backup-status" role="status" aria-live="polite">
            {actions.cloudBackupStatus}
          </div>
        )}

        <TopNav
          activePage={activePage}
          setActivePage={setActivePage}
          accounts={appData.accounts || []}
          selectedDashboardAccountId={actions.selectedDashboardAccountId || "all"}
          setSelectedDashboardAccountId={actions.setSelectedDashboardAccountId}
        />

        <div className="below-tabs-banner-stack">
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
                <span>Use GH Budgeting from your desktop or phone home screen. Data still stays local until cloud sync is built.</span>
              </div>
              <div className="unbacked-changes-actions">
                <button className="primary-button small" onClick={actions.installApp}>Install app</button>
                <button className="text-button" onClick={actions.dismissInstallPrompt}>Not now</button>
              </div>
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
