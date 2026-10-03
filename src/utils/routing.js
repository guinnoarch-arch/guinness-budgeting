import { ADMIN_ROUTE_PATH } from "../services/adminService.js";
import { NOT_FOUND_PAGE, pages } from "../pages/index.js";

const CONTROL_CENTRE_PATHS = [ADMIN_ROUTE_PATH, "/control-centre"];

// The URL is the source of truth for which page is open, so refresh,
// shared links and browser Back/Forward all land on the same screen.
export function readRouteFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (CONTROL_CENTRE_PATHS.includes(path)) return { page: "control", settingsSection: "" };
  if (path !== "/" && path !== "/index.html") return { page: NOT_FOUND_PAGE, settingsSection: "" };

  const requestedPage = params.get("page");
  if (!requestedPage) return { page: "dashboard", settingsSection: "" };
  if (!pages[requestedPage]) return { page: NOT_FOUND_PAGE, settingsSection: "" };

  return {
    page: requestedPage,
    settingsSection: requestedPage === "settings" ? params.get("settings") || "" : ""
  };
}

export function buildPageUrl(page, settingsSection = "") {
  if (page === "control") return ADMIN_ROUTE_PATH;
  if (page === "dashboard") return "/";
  if (page === "settings" && settingsSection) {
    return `/?page=settings&settings=${encodeURIComponent(settingsSection)}`;
  }
  return `/?page=${encodeURIComponent(page)}`;
}
