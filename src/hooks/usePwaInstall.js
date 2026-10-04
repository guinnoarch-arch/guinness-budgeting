import { useEffect, useState } from "react";
import { applyServiceWorkerUpdate, isStandaloneDisplayMode, registerAppServiceWorker } from "../services/pwaService.js";

// Install prompt, online/offline status and app updates for the installed
// (PWA) version of the app.
export default function usePwaInstall({ hasUnbackedChanges }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installStatus, setInstallStatus] = useState("");
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplayMode());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [waitingServiceWorker, setWaitingServiceWorker] = useState(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallStatus("");
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallStatus("App installed.");
    }

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    registerAppServiceWorker({
      onOfflineReady: () => setServiceWorkerReady(true),
      onUpdateReady: (worker) => setWaitingServiceWorker(worker)
    });
  }, []);

  async function installApp() {
    if (!installPrompt) {
      setInstallStatus("Your browser isn't offering to install the app right now. Use the browser menu and choose Install app or Add to Home Screen.");
      window.setTimeout(() => setInstallStatus(""), 5000);
      return;
    }

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setInstallStatus("Install accepted.");
    } else {
      setInstallStatus("Install cancelled. You can install later from Settings.");
    }

    window.setTimeout(() => setInstallStatus(""), 5000);
  }

  async function updateAppFromServiceWorker() {
    if (!waitingServiceWorker) return;

    if (hasUnbackedChanges) {
      const shouldContinue = confirm("You have changes since the last backup. Export a backup before updating unless you are sure. Continue with the app update?");
      if (!shouldContinue) return;
    }

    applyServiceWorkerUpdate(waitingServiceWorker);
  }

  return {
    installPrompt,
    installStatus,
    isInstalled,
    isOnline,
    serviceWorkerReady,
    waitingServiceWorker,
    hasUpdateAvailable: Boolean(waitingServiceWorker),
    installApp,
    updateAppFromServiceWorker
  };
}
