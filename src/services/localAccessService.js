const LOCAL_ACCESS_SESSION_KEY = "gh-budgeting-local-access-session-v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export function hasUsableLocalBudgetData(appData) {
  if (!appData || typeof appData !== "object") return false;

  const settings = appData.settings || {};
  const cloud = settings.cloudBackup || {};
  const profile = appData.profile || {};

  if (settings.hasStarted || settings.hasCompletedSetup || cloud.linkedLocalDataAt || cloud.lastCloudBackupAt) return true;
  if (profile.username || profile.displayName || profile.email) return true;

  const hasRealTransaction = (appData.transactions || []).some(item => !item?.isExample);
  const hasRealAccount = (appData.accounts || []).some(item => item?.isCustom || item?.openingBalance || item?.manualBalance);
  const hasRealGoal = (appData.savingsGoals || []).some(item => !item?.isExample);
  const hasClosedMonth = (appData.closedMonths || []).length > 0;
  const hasLoan = (appData.loans || []).some(item => !item?.isExample);

  return Boolean(hasRealTransaction || hasRealAccount || hasRealGoal || hasClosedMonth || hasLoan);
}

export function isLocalAccessSessionAllowed() {
  if (!isBrowser()) return false;
  try {
    return window.sessionStorage.getItem(LOCAL_ACCESS_SESSION_KEY) === "allowed";
  } catch {
    return false;
  }
}

export function storeLocalAccessSession() {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(LOCAL_ACCESS_SESSION_KEY, "allowed");
  } catch {
    // Session storage can be unavailable in locked-down browser modes.
  }
}

export function clearLocalAccessSession() {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(LOCAL_ACCESS_SESSION_KEY);
  } catch {
    // Nothing useful to do here.
  }
}
