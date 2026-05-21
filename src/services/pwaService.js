export function isStandaloneDisplayMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

export function canRegisterServiceWorker() {
  return "serviceWorker" in navigator && import.meta.env.PROD;
}

export function registerAppServiceWorker({ onUpdateReady, onOfflineReady } = {}) {
  if (!canRegisterServiceWorker()) return;

  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        if (registration.waiting) {
          onUpdateReady?.(registration.waiting);
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
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}

export function applyServiceWorkerUpdate(worker) {
  if (!worker) return;
  worker.postMessage({ type: "SKIP_WAITING" });
}
