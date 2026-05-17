import { useEffect, useState } from "react";
import { isStandaloneDisplayMode } from "../../services/pwaService.js";

export default function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [message, setMessage] = useState("");

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
      setMessage("");
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
      setMessage("Installed successfully.");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      setMessage("Install prompt is not available in this browser yet. Use the browser menu and choose Install app/Add to Home Screen after running the production build.");
      return;
    }

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setMessage("Install accepted. The app should now be available from your device apps/start menu.");
    } else {
      setMessage("Install cancelled. You can install it later from this settings page or the browser menu.");
    }
  }

  return (
    <section className="card pwa-install-card">
      <div className="section-header">
        <div>
          <h3>Install app</h3>
          <p className="muted-text">V1.11 adds Progressive Web App support so the web app can behave more like an installed app.</p>
        </div>
        <img className="settings-app-icon" src="/icons/gb-icon-192.png" alt="Guinness Budgeting app icon" />
      </div>

      <div className="pwa-status-grid">
        <div className="backup-status-item">
          <span>Status</span>
          <strong>{isInstalled ? "Installed" : installPrompt ? "Ready to install" : "Browser controlled"}</strong>
          <small>{isInstalled ? "Running as an installed app." : "The install option appears when the browser says the app is installable."}</small>
        </div>
        <div className="backup-status-item">
          <span>Works on</span>
          <strong>Web / phone / desktop browser</strong>
          <small>This does not add cloud sync. Data is still local unless restored from backup.</small>
        </div>
        <div className="backup-status-item">
          <span>Offline shell</span>
          <strong>Production build only</strong>
          <small>Use npm run build and npm run preview to test install behaviour.</small>
        </div>
      </div>

      <div className="backup-actions-row">
        <button className="primary-button" onClick={installApp} disabled={isInstalled}>
          {isInstalled ? "App installed" : "Install app"}
        </button>
      </div>

      <div className="backup-warning-box">
        <strong>Important</strong>
        <span>Installing the app does not move data between devices. Use Export full backup / Import backup until cloud sync is built.</span>
      </div>

      {message && <p className="muted-text">{message}</p>}
    </section>
  );
}
