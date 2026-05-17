export function isStandaloneDisplayMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

export function canRegisterServiceWorker() {
  return "serviceWorker" in navigator && import.meta.env.PROD;
}

export function registerAppServiceWorker() {
  if (!canRegisterServiceWorker()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}
