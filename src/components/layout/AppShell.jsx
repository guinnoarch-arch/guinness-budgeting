import { useMemo, useState } from "react";
import TopNav from "./TopNav.jsx";
import TransactionModal from "../transactions/TransactionModal.jsx";
import { getBackupReminder } from "../../services/storageService.js";
import { buildAppNotifications } from "../../utils/notifications.js";
import { CommandIcon, HeaderIconButton, LaptopIcon, MoonIcon, PhoneIcon, QrCodeIcon, SearchIcon, SunIcon } from "./HeaderIcons.jsx";
import { buildSearchResults } from "../../utils/appSearch.js";
import { resolveDeviceShareUrl } from "../../utils/shareUrl.js";
import { DeviceSharePanel } from "./DeviceSharePanel.jsx";
import { NotificationPanel } from "./NotificationPanel.jsx";
import { SearchPanel } from "./SearchPanel.jsx";
import { QuickActionsPanel } from "./QuickActionsPanel.jsx";
import { BannerStack } from "./BannerStack.jsx";

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
      <a className="skip-link" href="#main-content">Skip to content</a>
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
            {!actions.isNarrowScreen && (
              <HeaderIconButton
                label={actions.phoneMode ? "Desktop view" : "Phone view"}
                title={actions.phoneMode ? "Return to desktop layout" : "Use compact phone-friendly layout"}
                active={actions.phoneMode}
                onClick={actions.togglePhoneMode}
              >
                {actions.phoneMode ? <LaptopIcon /> : <PhoneIcon />}
              </HeaderIconButton>
            )}
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
                <DeviceSharePanel
                  copyShareLink={copyShareLink}
                  deviceShare={deviceShare}
                  setShowDeviceShare={setShowDeviceShare}
                  shareCopyStatus={shareCopyStatus}
                  shareUrl={shareUrl}
                />
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
                <NotificationPanel
                  notifications={notifications}
                  setActivePage={setActivePage}
                  setShowNotifications={setShowNotifications}
                />
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
          <SearchPanel
            searchQuery={searchQuery}
            searchResults={searchResults}
            setActivePage={setActivePage}
            setSearchQuery={setSearchQuery}
            setShowSearch={setShowSearch}
          />
        )}

        {showQuickActions && (
          <QuickActionsPanel
            actions={actions}
            setActivePage={setActivePage}
            setShowQuickActions={setShowQuickActions}
          />
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

        <BannerStack
          actions={actions}
          adminStatus={adminStatus}
          backupButtonLevel={backupButtonLevel}
          backupReminder={backupReminder}
          setActivePage={setActivePage}
          showInstallBanner={showInstallBanner}
          showUnbackedBanner={showUnbackedBanner}
          showUpdateBanner={showUpdateBanner}
        />
      </div>

      <main id="main-content" className="page-content app-scroll-area" tabIndex={-1}>{children}</main>

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
