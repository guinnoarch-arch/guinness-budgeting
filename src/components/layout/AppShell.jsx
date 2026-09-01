import { useMemo, useState } from "react";
import TopNav from "./TopNav.jsx";
import TransactionModal from "../transactions/TransactionModal.jsx";
import InlineQrCode from "../common/InlineQrCode.jsx";
import { getBackupReminder } from "../../services/storageService.js";
import { STABLE_PRODUCTION_APP_URL } from "../../services/adminService.js";
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

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M10 5h4" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

function LaptopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="4" width="14" height="10" rx="1.5" />
      <path d="M3 18h18" />
      <path d="m7 14-2 4" />
      <path d="m17 14 2 4" />
    </svg>
  );
}

function QrCodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 4h6v6H4V4Z" />
      <path d="M14 4h6v6h-6V4Z" />
      <path d="M4 14h6v6H4v-6Z" />
      <path d="M14 14h2v2h-2v-2Z" />
      <path d="M18 14h2v2h-2v-2Z" />
      <path d="M14 18h2v2h-2v-2Z" />
      <path d="M18 18h2v2h-2v-2Z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7h10" />
      <path d="M7 12h10" />
      <path d="M7 17h10" />
    </svg>
  );
}

function buildSearchResults(appData, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const includes = (value) => String(value || "").toLowerCase().includes(needle);
  const rows = [];
  (appData.transactions || []).forEach(item => {
    if ([item.title, item.note, item.date].some(includes)) rows.push({ type: "Transaction", label: item.title || "Transaction", detail: item.date, page: "transactions" });
  });
  (appData.accounts || []).forEach(item => {
    if ([item.name, item.type].some(includes)) rows.push({ type: "Account", label: item.name, detail: item.type, page: "accounts" });
  });
  (appData.categories || []).forEach(item => {
    if ([item.name, item.group].some(includes)) rows.push({ type: "Category", label: item.name, detail: item.group, page: "budgets" });
  });
  (appData.recurringItems || []).forEach(item => {
    if ([item.name, item.notes].some(includes)) rows.push({ type: "Bill", label: item.name, detail: item.nextDueDate, page: "bills" });
  });
  (appData.savingsGoals || []).forEach(item => {
    if ([item.name, item.notes].some(includes)) rows.push({ type: "Saving", label: item.name, detail: "Savings goal", page: "savings" });
  });
  (appData.houses || []).forEach(item => {
    if ([item.name, item.addressLabel, item.notes, item.agreementNotes].some(includes)) rows.push({ type: "House", label: item.name, detail: item.addressLabel, page: "loans" });
  });
  (appData.houseContributions || []).forEach(item => {
    if ([item.personName, item.notes, item.type].some(includes)) rows.push({ type: "House contribution", label: item.personName || item.type, detail: item.date, page: "loans" });
  });
  return rows.slice(0, 30);
}

function ControlCentreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3 5 6v5.5c0 4.2 2.8 7.9 7 9.5 4.2-1.6 7-5.3 7-9.5V6l-7-3Z" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  );
}

function normalisePublicAppUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLocalAppHost(hostname = "") {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
}

const STABLE_PRODUCTION_HOSTS = new Set(["guinness-budgeting.vercel.app"]);

function isPrivateAppHost(hostname = "") {
  const clean = String(hostname || "").toLowerCase();
  return (
    isLocalAppHost(clean) ||
    clean.endsWith(".local") ||
    clean.endsWith(".localhost") ||
    /^10\./.test(clean) ||
    /^192\.168\./.test(clean) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(clean)
  );
}

function resolveDeviceShareUrl() {
  if (typeof window === "undefined") {
    return { url: "", isLocalRuntime: false, needsDeployedUrl: false };
  }

  const configuredPublicUrl = normalisePublicAppUrl(import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_APP_PUBLIC_URL);
  const currentUrl = new URL(window.location.href);
  const isLocalRuntime = isLocalAppHost(currentUrl.hostname);
  const isVercelDashboard = currentUrl.hostname === "vercel.com" || currentUrl.hostname.endsWith(".vercel.com");
  const isVercelAppHost = currentUrl.hostname.endsWith(".vercel.app");
  const isStableProductionHost = STABLE_PRODUCTION_HOSTS.has(currentUrl.hostname);
  const isVercelPreviewHost = isVercelAppHost && !isStableProductionHost;
  const isPrivateRuntime = isPrivateAppHost(currentUrl.hostname);

  if (configuredPublicUrl) {
    return {
      url: configuredPublicUrl,
      isLocalRuntime,
      needsDeployedUrl: false,
      usingConfiguredUrl: true
    };
  }

  if (isStableProductionHost && currentUrl.protocol === "https:") {
    return {
      url: currentUrl.origin,
      isLocalRuntime: false,
      needsDeployedUrl: false,
      usingConfiguredUrl: false
    };
  }

  if (isLocalRuntime || isVercelDashboard || isVercelPreviewHost || isPrivateRuntime) {
    return {
      url: STABLE_PRODUCTION_APP_URL,
      isLocalRuntime,
      needsDeployedUrl: true,
      usingProductionFallback: true,
      isPreviewRuntime: isVercelPreviewHost || isVercelDashboard,
      isPrivateRuntime
    };
  }

  currentUrl.search = "";
  currentUrl.hash = "";
  return {
    url: `${currentUrl.origin}${currentUrl.pathname}`.replace(/\/$/, "") || currentUrl.origin,
    isLocalRuntime: false,
    needsDeployedUrl: false,
    usingConfiguredUrl: false
  };
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
  const showHeaderBackupButton = backupButtonLevel === "danger";
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
      setShareCopyStatus("Link copied");
    } catch {
      setShareCopyStatus("Could not copy link");
    }
    window.setTimeout(() => setShareCopyStatus(""), 2500);
  }

  return (
    <div className={`app-shell ${actions.phoneMode ? "phone-mode" : ""}`.trim()}>
      <div className="app-fixed-area">
        <header className="app-header">
          <div className="brand" onClick={() => setActivePage("dashboard")} role="button" tabIndex={0}>
            <div className="brand-icon"><img src="/icons/gb-icon-192.png" alt="" /></div>
            <div>
              <h1>Guinness & Holley Budgeting</h1>
              <p className="brand-subtitle">
                <span>Welcome back, {profileName}</span>
                <span className={connectionClass}>{connectionLabel}</span>
              </p>
            </div>
          </div>

          <div className="header-actions">
            <span className={`${connectionClass} header-connection-pill`}>{connectionLabel}</span>
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

            {adminStatus.isAdmin && (
              <HeaderIconButton
                label="Control Centre"
                title="Control Centre"
                active={activePage === "control"}
                onClick={() => setActivePage("control")}
              >
                <ControlCentreIcon />
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
                ["Settings/Profile", () => setActivePage("settings")],
                ["App health check", () => setActivePage("settings")],
                ["Close month", () => setActivePage("settings")],
                ["Add bill", () => setActivePage("bills")],
                ["Add house contribution", () => setActivePage("loans")]
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
          featureFlags={featureFlags}
        />

        <div className="below-tabs-banner-stack">
          {featureFlags.maintenanceMode && (
            <div className="install-app-banner maintenance-banner" role="status" aria-live="polite">
              <div>
                <strong>Maintenance notice</strong>
                <span>Admin maintenance mode is enabled. Avoid large imports until it is turned off.</span>
              </div>
              {adminStatus.isAdmin && <button className="text-button" onClick={() => setActivePage("control")}>Control Centre</button>}
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
