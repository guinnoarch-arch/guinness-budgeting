export function isStandaloneDisplayMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

export function canRegisterServiceWorker() {
  return "serviceWorker" in navigator && import.meta.env.PROD;
}

export function registerAppServiceWorker({ onUpdateReady, onOfflineReady } = {}) {
  if (!canRegisterServiceWorker()) return;

  let refreshing = false;
  let updateCheckTimer = null;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting) {
          onUpdateReady?.(registration.waiting);
        }

        function checkForUpdates() {
          if (!navigator.onLine) return;
          registration.update().catch((error) => {
            console.warn("Service worker update check failed:", error);
          });
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              onUpdateReady?.(newWorker);
            }
          });
        });

        navigator.serviceWorker.ready.then(() => {
          onOfflineReady?.(registration);
        });

        checkForUpdates();
        updateCheckTimer = window.setInterval(checkForUpdates, 60 * 60 * 1000);

        window.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdates();
        });

        window.addEventListener("online", checkForUpdates);
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });

  window.addEventListener("beforeunload", () => {
    if (updateCheckTimer) window.clearInterval(updateCheckTimer);
  });
}

export function applyServiceWorkerUpdate(worker) {
  if (!worker) {
    window.location.reload();
    return;
  }
  worker.postMessage({ type: "SKIP_WAITING" });
}
