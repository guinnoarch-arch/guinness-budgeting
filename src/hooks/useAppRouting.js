import { useEffect, useState } from "react";
import { buildPageUrl, readRouteFromLocation } from "../utils/routing.js";
import { APP_NAME, PAGE_TITLES } from "../pages/index.js";

// Which page is open, kept in sync with the URL so refresh, shared links and
// browser Back/Forward all work.
export default function useAppRouting() {
  const [activePage, setActivePage] = useState(() => readRouteFromLocation().page);
  const [preferredSettingsSection, setPreferredSettingsSection] = useState(() => readRouteFromLocation().settingsSection);
  // Bumped on every request so asking for the same Settings section twice
  // still re-opens and scrolls to it.
  const [settingsSectionRequestId, setSettingsSectionRequestId] = useState(0);
  // A one-off "do this when the page opens" request, e.g. open the Add bill
  // form from Quick actions. The page clears it once handled.
  const [pageIntent, setPageIntent] = useState(null);

  useEffect(() => {
    function handlePopState() {
      const route = readRouteFromLocation();
      setActivePage(route.page);
      if (route.settingsSection) setPreferredSettingsSection(route.settingsSection);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const pageTitle = PAGE_TITLES[activePage];
    document.title = pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME;
  }, [activePage]);

  function navigateToPage(page, options = {}) {
    setActivePage(page);
    if (options.settingsSection) {
      setPreferredSettingsSection(options.settingsSection);
      setSettingsSectionRequestId(id => id + 1);
    }
    setPageIntent(options.intent ? { page, intent: options.intent } : null);

    try {
      const nextUrl = buildPageUrl(page, options.settingsSection);
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      // Re-clicking the current tab shouldn't add a duplicate history entry.
      if (nextUrl !== currentUrl) window.history.pushState({}, "", nextUrl);
    } catch {
      // URL updates are ergonomic only; keep in-app navigation working.
    }
  }

  function openSettingsProfile() {
    navigateToPage("settings", { settingsSection: "profile" });
  }

  return {
    activePage,
    navigateToPage,
    openSettingsProfile,
    preferredSettingsSection,
    settingsSectionRequestId,
    pageIntent,
    clearPageIntent: () => setPageIntent(null)
  };
}
