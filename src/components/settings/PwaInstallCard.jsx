export default function PwaInstallCard({ pwaInstall, actions, embedded = false }) {
  const isInstalled = Boolean(pwaInstall?.isInstalled);
  const canInstall = Boolean(pwaInstall?.installPrompt) && !isInstalled;
  const isOnline = pwaInstall?.isOnline !== false;
  const offlineReady = Boolean(pwaInstall?.serviceWorkerReady);
  const hasUpdate = Boolean(pwaInstall?.hasUpdateAvailable);
  const Wrapper = embedded ? "div" : "section";

  return (
    <Wrapper className={embedded ? "pwa-install-card-embedded" : "card pwa-install-card"}>
      {!embedded && (
        <div className="section-header">
          <div>
            <p className="eyebrow">Installable app</p>
            <h3>Install app and offline mode</h3>
          </div>
          <img className="settings-app-icon" src="/icons/gb-icon-192.png" alt="Guinness & Holley Budgeting app icon" />
        </div>
      )}

      <div className="pwa-status-grid">
        <div className="backup-status-item">
          <span>Install status</span>
          <strong>{isInstalled ? "Installed" : canInstall ? "Ready to install" : "Browser controlled"}</strong>
          <small>{isInstalled ? "Running as an installed app." : canInstall ? "Click Install app below." : "Use the browser menu if the install prompt is not shown."}</small>
        </div>
        <div className="backup-status-item">
          <span>Connection</span>
          <strong>{isOnline ? "Online" : "Offline"}</strong>
          <small>{isOnline ? "The app can refresh from the hosted version." : "The cached app shell should still open after it has been loaded once."}</small>
        </div>
        <div className="backup-status-item">
          <span>Offline shell</span>
          <strong>{offlineReady ? "Ready" : "Production build only"}</strong>
          <small>Offline support is active after a production build has registered the service worker.</small>
        </div>
        <div className="backup-status-item">
          <span>Update status</span>
          <strong>{hasUpdate ? "Update available" : "Current version loaded"}</strong>
          <small>{hasUpdate ? "Backup first, then update." : "The browser will check for updates when the app reloads."}</small>
        </div>
      </div>

      <div className="backup-actions-row">
        <button className="primary-button" onClick={actions.installApp} disabled={isInstalled}>
          {isInstalled ? "App installed" : "Install app"}
        </button>
        <button className="secondary-button" onClick={actions.updateAppFromServiceWorker} disabled={!hasUpdate}>
          Update app
        </button>
      </div>

      <div className="backup-warning-box">
        <strong>Important</strong>
        <span>Installing doesn't sync data between devices. On a new phone, open the app, sign in, then restore your latest cloud backup if needed. An exported backup file is still the safest copy to keep.</span>
      </div>

      {pwaInstall?.installStatus && <p className="muted-text">{pwaInstall.installStatus}</p>}
    </Wrapper>
  );
}
