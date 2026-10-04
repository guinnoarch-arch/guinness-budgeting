// Working out which web address to show in the "open on another device" QR code.
import { STABLE_PRODUCTION_APP_URL } from "../services/adminService.js";

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

export function resolveDeviceShareUrl() {
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
