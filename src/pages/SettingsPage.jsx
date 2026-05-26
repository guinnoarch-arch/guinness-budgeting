import { useEffect, useRef, useState } from "react";
import {
  APP_VERSION,
  DATA_SCHEMA_VERSION,
  buildRestoreComparisonWarnings,
  clearAppData,
  exportJsonBackup,
  exportRawSavedData,
  getBackupCounts,
  getBackupReminder,
  getStorageHealth,
  getStorageHealthAsync,
  enablePersistentBrowserStorage,
  checkPersistentBrowserStorage,
  parseBackupFile,
  parseBackupObject,
  prepareDataForBackupExport,
  prepareRestoredAppData,
  updateLocalProfile
} from "../services/storageService.js";
import { getInitialAppData } from "../data/exampleData.js";
import PwaInstallCard from "../components/settings/PwaInstallCard.jsx";
import { createId } from "../utils/ids.js";
import { getReceiptStorageStats, restoreReceiptBackupRecords } from "../services/receiptStorageService.js";
import { repairSafeAppDataIssues, validateCurrentAppData } from "../services/dataValidationService.js";
import { addStorageLog, clearStorageLogs, listStorageLogs, saveAppDataSnapshot } from "../services/indexedDbStorageService.js";
import {
  clearStoredCloudSession,
  deleteSupabaseCloudBackup,
  downloadCloudBackupJson,
  fetchSupabaseCloudBackup,
  fetchLatestSupabaseCloudBackup,
  getCloudConfig,
  getSupabaseKeySafetyIssue,
  getStoredCloudSessionSummary,
  getSupabaseSetupSql,
  isCloudBackupConfigured,
  isCloudLoginGateRequired,
  listSupabaseCloudBackups,
  uploadSupabaseCloudBackup
} from "../services/cloudBackupService.js";
import {
  getDisplayUsernameFromSession,
  ensureProfileForSignedInUser,
  normaliseEmail,
  normaliseUsername,
  signInWithEmailOrUsername,
  signUpWithEmail
} from "../services/authService.js";

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function CountGrid({ counts }) {
  const labels = [
    ["transactions", "Transactions"],
    ["accounts", "Accounts"],
    ["categories", "Categories"],
    ["budgets", "Budgets"],
    ["recurringItems", "Recurring items"],
    ["savingsGoals", "Savings goals"],
    ["closedMonths", "Closed months"],
    ["accountAdjustments", "Account adjustments"],
    ["importBatches", "CSV import batches"],
    ["importRules", "Import rules"],
    ["transferRules", "Transfer rules"],
    ["externalAccountMappings", "External account mappings"],
    ["csvColumnMappings", "Saved CSV mappings"],
    ["loans", "Loans"],
    ["loanEvents", "Loan events"],
    ["receiptAttachments", "Transactions with receipts"],
    ["profiles", "Local profiles"]
  ];

  if (Number(counts?.indexedDbReceipts || 0) > 0) {
    labels.push(["indexedDbReceipts", "Receipt files in backup"]);
  }

  return (
    <div className="backup-count-grid">
      {labels.map(([key, label]) => (
        <div key={key} className="backup-count-card">
          <strong>{counts?.[key] ?? 0}</strong>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

function WarningList({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="backup-warning-box">
      <strong>Check before continuing</strong>
      <ul>
        {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
      </ul>
    </div>
  );
}

function SeverityPill({ severity }) {
  const label = severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Info";
  return <span className={`pill validation-${severity || "info"}`}>{label}</span>;
}

function ValidationIssueList({ report }) {
  if (!report) {
    return <p className="muted-text">Run a check to scan transactions, categories, budgets, loans, recurring items and links.</p>;
  }

  if (!report.issues.length) {
    return <p className="storage-good-message">No data issues found.</p>;
  }

  return (
    <div className="validation-issue-list">
      {report.issues.slice(0, 80).map(issue => (
        <div key={issue.id} className={`validation-issue-row ${issue.severity}`}>
          <div>
            <strong>{issue.title}</strong>
            <p>{issue.detail}</p>
            {issue.repairable && <small>Safe repair: {issue.repairDescription}</small>}
          </div>
          <SeverityPill severity={issue.severity} />
        </div>
      ))}
      {report.issues.length > 80 && <p className="muted-text">Showing first 80 issues. Repair/export before doing more changes.</p>}
    </div>
  );
}

function StorageLogList({ logs }) {
  if (!logs || logs.length === 0) {
    return <p className="muted-text">No storage or migration logs yet.</p>;
  }

  return (
    <div className="storage-log-list">
      {logs.slice(0, 30).map(log => (
        <div key={log.id} className={`storage-log-row ${log.level || "info"}`}>
          <span>{formatDateTime(log.createdAt)}</span>
          <strong>{log.event || "storage_event"}</strong>
          <p>{log.message}</p>
          {log.details?.previousVersion && (
            <small>Version {log.details.previousVersion} to {log.details.newVersion || "current"}</small>
          )}
          {Array.isArray(log.details?.actions) && log.details.actions.length > 0 && (
            <small>{log.details.actions.join(" ")}</small>
          )}
          {Array.isArray(log.details?.warnings) && log.details.warnings.length > 0 && (
            <small>Warnings: {log.details.warnings.join(" ")}</small>
          )}
        </div>
      ))}
    </div>
  );
}


function CloudBackupRows({ rows, onPreview, onDownload, onDelete }) {
  if (!rows || rows.length === 0) {
    return <p className="muted-text">No cloud backups found yet.</p>;
  }

  return (
    <div className="cloud-backup-list">
      {rows.map(row => (
        <div key={row.id} className="cloud-backup-row">
          <div>
            <strong>{row.backup_label || "Cloud backup"}</strong>
            <small>Type: {(row.source || "manual-cloud-backup").replace("-cloud-backup", "")}</small>
            <small>{formatDateTime(row.client_generated_at || row.created_at)} · V{row.app_version || "?"}</small>
            <small>{row.counts?.transactions ?? 0} transactions · {row.counts?.accounts ?? 0} accounts · {row.counts?.loans ?? 0} loans</small>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button small" onClick={() => onPreview(row.id)}>Preview restore</button>
            <button type="button" className="secondary-button small" onClick={() => onDownload(row.id)}>Download JSON</button>
            <button type="button" className="danger-button small" onClick={() => onDelete(row.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function backupReminderClass(level) {
  if (level === "danger") return "storage-reminder danger";
  if (level === "warning") return "storage-reminder warning";
  if (level === "notice") return "storage-reminder notice";
  return "storage-reminder ok";
}

async function createEmergencyRestoreSnapshot(data, reason) {
  try {
    await saveAppDataSnapshot(data, reason);
    await addStorageLog({
      level: "warning",
      event: "pre_restore_snapshot_created",
      message: "Created an emergency snapshot before replacing current app data.",
      details: {
        reason,
        createdAt: new Date().toISOString(),
        counts: getBackupCounts(data)
      }
    });
    return true;
  } catch (error) {
    await addStorageLog({
      level: "error",
      event: "pre_restore_snapshot_failed",
      message: error.message || "Could not create emergency snapshot before restore.",
      details: { reason }
    });
    return false;
  }
}

function normaliseRuleText(value) {
  return String(value || "").trim().toLowerCase();
}

const ACCENT_PRESETS = [
  { name: "GH logo green", value: "#0b5d45" },
  { name: "Classic teal", value: "#0f766e" },
  { name: "Gold", value: "#b8872c" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Red", value: "#b91c1c" }
];

function isValidHexColour(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

export default function SettingsPage({ appData, actions }) {
  const fileInputRef = useRef(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  const [restorePhrase, setRestorePhrase] = useState("");
  const [rawExportStatus, setRawExportStatus] = useState("");
  const [ruleStatus, setRuleStatus] = useState("");
  const [activeSettingsSection, setActiveSettingsSection] = useState(null);
  const [activeImportRulesPanel, setActiveImportRulesPanel] = useState("external");
  const [selectedRuleCategoryId, setSelectedRuleCategoryId] = useState("");
  const [newExternalName, setNewExternalName] = useState("");
  const [newExternalAccountId, setNewExternalAccountId] = useState("");
  const [newCategoryMatchText, setNewCategoryMatchText] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [receiptStats, setReceiptStats] = useState({ available: true, count: 0, totalKilobytes: 0, totalMegabytes: 0, lastUploadedAt: null });
  const [storageHealth, setStorageHealth] = useState(() => getStorageHealth(appData));
  const [persistentStorageStatus, setPersistentStorageStatus] = useState("");
  const [newSuggestionText, setNewSuggestionText] = useState("");
  const [validationReport, setValidationReport] = useState(null);
  const [validationStatus, setValidationStatus] = useState("");
  const [storageLogs, setStorageLogs] = useState([]);
  const [storageLogStatus, setStorageLogStatus] = useState("");
  const [cloudForm, setCloudForm] = useState(() => ({
    email: appData.settings?.cloudBackup?.cloudUserEmail || appData.profile?.email || "",
    loginIdentifier: appData.settings?.cloudBackup?.cloudUserEmail || "",
    username: appData.settings?.cloudBackup?.cloudUsername || appData.profile?.username || ""
  }));
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudConfirmPassword, setCloudConfirmPassword] = useState("");
  const [cloudSession, setCloudSession] = useState(() => getStoredCloudSessionSummary());
  const [cloudStatus, setCloudStatus] = useState("");
  const [cloudBackups, setCloudBackups] = useState([]);
  const [cloudRestorePreview, setCloudRestorePreview] = useState(null);
  const [cloudRestorePhrase, setCloudRestorePhrase] = useState("");
  const [showCloudSql, setShowCloudSql] = useState(false);

  const currentCounts = getBackupCounts(appData);
  const settings = appData.settings || {};
  const profile = appData.profile || {};
  const cloudSettings = settings.cloudBackup || {};
  const cloudConfigured = isCloudBackupConfigured(settings);
  const cloudLoginGateRequired = isCloudLoginGateRequired(settings);
  const cloudKeySafetyIssue = getSupabaseKeySafetyIssue(getCloudConfig(settings).anonKey);
  const cloudSetupSql = getSupabaseSetupSql();
  const backupReminder = getBackupReminder(settings);
  const comparisonWarnings = restorePreview
    ? buildRestoreComparisonWarnings(appData, restorePreview)
    : [];

  useEffect(() => {
    let cancelled = false;

    async function refreshReceiptStats() {
      const stats = await getReceiptStorageStats();
      if (!cancelled) setReceiptStats(stats);
    }

    refreshReceiptStats();

    return () => {
      cancelled = true;
    };
  }, [appData.transactions]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStorageHealth() {
      const [health, persistent] = await Promise.all([
        getStorageHealthAsync(appData),
        checkPersistentBrowserStorage()
      ]);
      if (!cancelled) {
        setStorageHealth(health);
        if (persistent.supported) {
          setPersistentStorageStatus(persistent.persisted ? "Persistent browser storage granted" : "Persistent browser storage not granted yet");
        }
      }
    }

    setStorageHealth(getStorageHealth(appData));
    refreshStorageHealth();

    return () => {
      cancelled = true;
    };
  }, [appData]);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      try {
        const logs = await listStorageLogs({ limit: 30 });
        if (!cancelled) setStorageLogs(logs);
      } catch (error) {
        if (!cancelled) setStorageLogStatus(error.message || "Could not load storage logs.");
      }
    }

    loadLogs();

    return () => {
      cancelled = true;
    };
  }, [appData?.settings?.migratedFromLocalStorageAt, appData?.settings?.lastValidationRepairAt]);

  useEffect(() => {
    setCloudForm(prev => ({
      email: settings.cloudBackup?.cloudUserEmail || profile.email || prev.email || "",
      loginIdentifier: prev.loginIdentifier || settings.cloudBackup?.cloudUserEmail || profile.email || "",
      username: settings.cloudBackup?.cloudUsername || profile.username || prev.username || ""
    }));
    setCloudSession(getStoredCloudSessionSummary(settings));
  }, [settings.cloudBackup?.cloudUserEmail, settings.cloudBackup?.cloudUsername, profile.email, profile.username]);

  async function requestPersistentStorage() {
    setPersistentStorageStatus("Requesting persistent browser storage...");
    const result = await enablePersistentBrowserStorage();
    setPersistentStorageStatus(result.message);
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        persistentStorageRequestedAt: new Date().toISOString(),
        persistentStorageGranted: Boolean(result.persisted)
      }
    }, { reason: "Persistent browser storage requested", markDirty: false });
  }

  async function refreshStorageLogList() {
    setStorageLogStatus("");
    try {
      const logs = await listStorageLogs({ limit: 30 });
      setStorageLogs(logs);
    } catch (error) {
      setStorageLogStatus(error.message || "Could not load storage logs.");
    }
  }

  async function clearStorageLogList() {
    if (!confirm("Clear storage and migration logs? This does not delete budget data.")) return;
    try {
      await clearStorageLogs();
      setStorageLogs([]);
      setStorageLogStatus("Storage logs cleared.");
    } catch (error) {
      setStorageLogStatus(error.message || "Could not clear storage logs.");
    }
  }

  function runDataValidation() {
    const report = validateCurrentAppData(appData);
    setValidationReport(report);
    setValidationStatus(report.issues.length
      ? `${report.summary.totalIssues} issue(s) found. ${report.summary.repairableCount} can be safely repaired.`
      : "No data issues found.");

    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        lastValidationReportAt: report.createdAt,
        lastValidationIssueCount: report.summary.totalIssues,
        lastValidationErrorCount: report.summary.errorCount,
        lastValidationWarningCount: report.summary.warningCount
      }
    }, { reason: "Data validation checked", markDirty: false });
  }

  async function repairValidationIssues() {
    const report = validationReport || validateCurrentAppData(appData);
    const repairableCount = report.summary?.repairableCount || 0;

    if (!repairableCount) {
      setValidationStatus("No safe automatic repairs are available.");
      return;
    }

    if (!confirm(`Apply ${repairableCount} safe automatic repair(s)? Export a backup first if you have not done one recently.`)) return;

    const result = repairSafeAppDataIssues(appData, report);
    setValidationReport(result.nextReport);
    setValidationStatus(result.repairs.length
      ? `Applied ${result.repairs.length} repair(s). Recheck result: ${result.nextReport.summary.totalIssues} issue(s) remain.`
      : "No changes were needed.");

    try {
      await addStorageLog({
        level: "warning",
        event: "validation_safe_repair",
        message: `Applied ${result.repairs.length} safe data repair(s).`,
        details: { repairs: result.repairs.slice(0, 50) }
      });
      await refreshStorageLogList();
    } catch (error) {
      console.warn("Could not write validation repair log:", error);
    }

    actions.updateAppData({
      ...result.data,
      settings: {
        ...(result.data.settings || {}),
        lastValidationReportAt: result.nextReport.createdAt,
        lastValidationIssueCount: result.nextReport.summary.totalIssues,
        lastValidationErrorCount: result.nextReport.summary.errorCount,
        lastValidationWarningCount: result.nextReport.summary.warningCount
      }
    }, { reason: "Safe data repair applied", major: true });
  }


  function saveCloudSettings(patch = {}) {
    const nextCloud = {
      provider: "supabase",
      mode: "auto-cloud-backup",
      enabled: Boolean(patch.enabled ?? cloudSettings.enabled ?? false),
      requireLoginBeforeData: patch.requireLoginBeforeData ?? cloudSettings.requireLoginBeforeData ?? true,
      supabaseUrl: "",
      supabaseAnonKey: "",
      tableName: patch.tableName || cloudSettings.tableName || "gh_cloud_backups",
      cloudUserId: patch.cloudUserId ?? cloudSettings.cloudUserId ?? null,
      cloudUsername: patch.cloudUsername ?? normaliseUsername(cloudForm.username || cloudSettings.cloudUsername || ""),
      cloudUserEmail: patch.cloudUserEmail ?? normaliseEmail(cloudForm.email || cloudSettings.cloudUserEmail || ""),
      lastSignedInAt: patch.lastSignedInAt ?? cloudSettings.lastSignedInAt ?? null,
      lastCloudBackupAt: patch.lastCloudBackupAt ?? cloudSettings.lastCloudBackupAt ?? null,
      lastCloudBackupId: patch.lastCloudBackupId ?? cloudSettings.lastCloudBackupId ?? null,
      lastCloudRestoreAt: patch.lastCloudRestoreAt ?? cloudSettings.lastCloudRestoreAt ?? null,
      lastCloudListAt: patch.lastCloudListAt ?? cloudSettings.lastCloudListAt ?? null,
      lastCloudError: patch.lastCloudError ?? null,
      cloudBackupNeeded: patch.cloudBackupNeeded ?? cloudSettings.cloudBackupNeeded ?? false,
      linkedLocalDataAt: patch.linkedLocalDataAt ?? cloudSettings.linkedLocalDataAt ?? null,
      lastAutoCloudBackupAt: patch.lastAutoCloudBackupAt ?? cloudSettings.lastAutoCloudBackupAt ?? null,
      cloudConflict: patch.cloudConflict ?? cloudSettings.cloudConflict ?? null,
      lastCloudConflictAt: patch.lastCloudConflictAt ?? cloudSettings.lastCloudConflictAt ?? null,
      appSessionDays: Number(patch.appSessionDays ?? cloudSettings.appSessionDays ?? 7),
      version: "1"
    };

    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        cloudBackup: nextCloud
      }
    }, { reason: "Cloud backup settings changed", markDirty: false });

    return nextCloud;
  }

  function saveCloudConfiguration() {
    const keySafetyIssue = getSupabaseKeySafetyIssue(getCloudConfig(settings).anonKey);
    if (keySafetyIssue) {
      setCloudStatus(keySafetyIssue);
      return;
    }

    const nextCloud = saveCloudSettings({
      enabled: true,
      cloudUserEmail: normaliseEmail(cloudForm.email),
      cloudUsername: normaliseUsername(cloudForm.username),
      lastCloudError: null
    });
    setCloudStatus(isCloudBackupConfigured({ ...settings, cloudBackup: nextCloud })
      ? "Cloud account details saved."
      : "Cloud backup is not available for this build.");
  }

  async function cloudSignIn() {
    const keySafetyIssue = getSupabaseKeySafetyIssue(getCloudConfig(settings).anonKey);
    if (keySafetyIssue) {
      setCloudStatus(keySafetyIssue);
      return;
    }

    setCloudStatus("Signing in...");
    try {
      const nextCloud = saveCloudSettings({
        enabled: true,
        cloudUserEmail: normaliseEmail(cloudForm.email),
        cloudUsername: normaliseUsername(cloudForm.username),
        lastCloudError: null
      });
      const session = await signInWithEmailOrUsername({ ...settings, cloudBackup: nextCloud }, cloudForm.loginIdentifier || cloudForm.email, cloudPassword);
      setCloudSession(getStoredCloudSessionSummary({ ...settings, cloudBackup: nextCloud }));
      actions.refreshCloudAuthState?.();
      setCloudPassword("");
      const profileUsername = cloudForm.username || session.user?.user_metadata?.username || profile.username || "";
      await ensureProfileForSignedInUser({ ...settings, cloudBackup: nextCloud }, session, profileUsername).catch(() => null);
      saveCloudSettings({
        ...nextCloud,
        enabled: true,
        cloudUserId: session.user?.id || null,
        cloudUsername: normaliseUsername(profileUsername),
        cloudUserEmail: session.user?.email || normaliseEmail(cloudForm.email),
        lastSignedInAt: new Date().toISOString(),
        cloudBackupNeeded: Boolean(!nextCloud.linkedLocalDataAt),
        lastCloudError: null
      });
      setCloudStatus("Signed in to Supabase cloud backup.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud sign-in failed.");
      saveCloudSettings({ lastCloudError: error.message || "Cloud sign-in failed." });
    }
  }

  async function cloudSignUp() {
    const keySafetyIssue = getSupabaseKeySafetyIssue(getCloudConfig(settings).anonKey);
    if (keySafetyIssue) {
      setCloudStatus(keySafetyIssue);
      return;
    }

    setCloudStatus("Creating cloud account...");
    try {
      const nextCloud = saveCloudSettings({
        enabled: true,
        cloudUserEmail: normaliseEmail(cloudForm.email),
        cloudUsername: normaliseUsername(cloudForm.username),
        lastCloudError: null
      });
      const result = await signUpWithEmail({ ...settings, cloudBackup: nextCloud }, {
        email: cloudForm.email,
        username: cloudForm.username,
        password: cloudPassword,
        confirmPassword: cloudConfirmPassword
      });
      setCloudSession(getStoredCloudSessionSummary({ ...settings, cloudBackup: nextCloud }));
      actions.refreshCloudAuthState?.();
      setCloudPassword("");
      setCloudConfirmPassword("");
      if (result.pendingEmailConfirmation) {
        setCloudStatus("Account created. Check your email if Supabase confirmation is enabled, then sign in.");
      } else {
        saveCloudSettings({
          ...nextCloud,
          enabled: true,
          cloudUserId: result.user?.id || null,
          cloudUsername: normaliseUsername(cloudForm.username),
          cloudUserEmail: result.user?.email || normaliseEmail(cloudForm.email),
          lastSignedInAt: new Date().toISOString(),
          cloudBackupNeeded: Boolean(!nextCloud.linkedLocalDataAt),
          lastCloudError: null
        });
        setCloudStatus("Signed up and signed in to Supabase cloud backup.");
      }
    } catch (error) {
      setCloudStatus(error.message || "Cloud sign-up failed.");
      saveCloudSettings({ lastCloudError: error.message || "Cloud sign-up failed." });
    }
  }

  function cloudSignOut() {
    clearStoredCloudSession();
    setCloudSession(getStoredCloudSessionSummary(settings));
    actions.refreshCloudAuthState?.();
    setCloudBackups([]);
    setCloudStatus("Signed out from cloud backup on this browser.");
  }

  async function refreshCloudBackupList() {
    setCloudStatus("Loading cloud backups...");
    try {
      const rows = await listSupabaseCloudBackups(settings, 10);
      setCloudBackups(rows);
      saveCloudSettings({ lastCloudListAt: new Date().toISOString(), lastCloudError: null });
      setCloudStatus(rows.length ? `Loaded ${rows.length} cloud backup(s).` : "No cloud backups found yet.");
    } catch (error) {
      setCloudStatus(error.message || "Could not list cloud backups.");
      saveCloudSettings({ lastCloudError: error.message || "Could not list cloud backups." });
    }
  }

  async function uploadCloudBackupNow() {
    if (!cloudConfigured) {
      setCloudStatus("Cloud backup is not available for this build.");
      return;
    }

    const warning = settings.hasUnbackedChanges
      ? "You have unbacked local changes. Uploading now will save the current local state to Supabase. Continue?"
      : "Upload a cloud backup of the current local data?";
    if (!confirm(warning)) return;

    setCloudStatus("Uploading cloud backup...");
    try {
      const row = await uploadSupabaseCloudBackup(settings, appData, { exportedAt: new Date().toISOString(), backupType: "manual" });
      const uploadedAt = row?.created_at || new Date().toISOString();
      saveCloudSettings({
        lastCloudBackupAt: uploadedAt,
        lastCloudBackupId: row?.id || null,
        linkedLocalDataAt: cloudSettings.linkedLocalDataAt || uploadedAt,
        cloudBackupNeeded: false,
        lastCloudError: null
      });
      await refreshCloudBackupList();
      setCloudStatus("Cloud backup uploaded.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud backup upload failed.");
      saveCloudSettings({ lastCloudError: error.message || "Cloud backup upload failed." });
    }
  }

  async function linkLocalDataToCloud() {
    if (!cloudSession.signedIn) {
      setCloudStatus("Sign in before linking local data to cloud backup.");
      return;
    }
    if (!confirm("Link this browser's existing local data to the signed-in account and upload the first cloud backup?")) return;
    setCloudStatus("Linking local data and uploading first cloud backup...");
    try {
      const row = await uploadSupabaseCloudBackup(settings, appData, {
        exportedAt: new Date().toISOString(),
        backupType: "manual",
        label: "Initial linked local data"
      });
      const uploadedAt = row?.created_at || new Date().toISOString();
      saveCloudSettings({
        linkedLocalDataAt: uploadedAt,
        lastCloudBackupAt: uploadedAt,
        lastCloudBackupId: row?.id || null,
        cloudBackupNeeded: false,
        lastCloudError: null
      });
      setCloudStatus("Existing local data is linked to this account and backed up.");
      await refreshCloudBackupList();
    } catch (error) {
      setCloudStatus(error.message || "Could not link local data to cloud backup.");
      saveCloudSettings({ lastCloudError: error.message || "Could not link local data to cloud backup.", cloudBackupNeeded: true });
    }
  }

  async function previewCloudRestore(backupId) {
    setCloudStatus("Loading cloud backup preview...");
    setCloudRestorePreview(null);
    setCloudRestorePhrase("");
    try {
      const row = await fetchSupabaseCloudBackup(settings, backupId);
      const preview = parseBackupObject(row.backup_json, `cloud-backup-${String(row.id || "").slice(0, 8)}.json`);
      setCloudRestorePreview({ ...preview, row });
      setCloudStatus("Cloud backup preview loaded. Check counts before restoring.");
    } catch (error) {
      setCloudStatus(error.message || "Could not load cloud backup preview.");
    }
  }

  async function previewLatestCloudRestore() {
    setCloudStatus("Loading latest cloud backup...");
    try {
      const row = await fetchLatestSupabaseCloudBackup(settings);
      if (!row?.id) {
        setCloudStatus("No cloud backup found for this account.");
        return;
      }
      await previewCloudRestore(row.id);
    } catch (error) {
      setCloudStatus(error.message || "Could not load latest cloud backup.");
    }
  }

  async function downloadCloudBackup(backupId) {
    setCloudStatus("Downloading cloud backup...");
    try {
      const row = await fetchSupabaseCloudBackup(settings, backupId);
      const result = await downloadCloudBackupJson(row);
      setCloudStatus(result.ok ? `Downloaded ${result.filename}.` : "Cloud backup download did not complete.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud backup download failed.");
    }
  }

  async function deleteCloudBackup(backupId) {
    if (!confirm("Delete this cloud backup from Supabase? This does not delete local app data.")) return;
    setCloudStatus("Deleting cloud backup...");
    try {
      await deleteSupabaseCloudBackup(settings, backupId);
      setCloudBackups(rows => rows.filter(row => row.id !== backupId));
      setCloudStatus("Cloud backup deleted.");
    } catch (error) {
      setCloudStatus(error.message || "Cloud backup delete failed.");
    }
  }

  async function confirmCloudRestore() {
    if (!cloudRestorePreview || cloudRestorePhrase !== "CLOUD RESTORE") return;
    const restoredAt = new Date().toISOString();
    const snapshotCreated = await createEmergencyRestoreSnapshot(appData, "pre-cloud-restore");
    if (!snapshotCreated && !confirm("Could not create an emergency browser snapshot before cloud restore. Continue replacing local data anyway?")) {
      setCloudStatus("Cloud restore cancelled because the emergency snapshot could not be created.");
      return;
    }

    const nextData = prepareRestoredAppData(
      cloudRestorePreview.data,
      cloudRestorePreview.filename,
      restoredAt,
      cloudRestorePreview.meta
    );

    actions.updateAppData({
      ...nextData,
      settings: {
        ...(nextData.settings || {}),
        cloudBackup: {
          ...cloudSettings,
          lastCloudRestoreAt: restoredAt,
          lastCloudError: null
        }
      }
    }, { markDirty: false });
    setCloudRestorePreview(null);
    setCloudRestorePhrase("");
    setCloudStatus("Cloud backup restored into local IndexedDB data.");
    alert("Cloud backup restored. Export a local JSON backup after checking the data.");
  }

  function updateProfileField(field, value) {
    const updatedAt = new Date().toISOString();
    const nextProfile = {
      ...profile,
      [field]: value,
      updatedAt
    };

    const nextSettings = {
      ...settings
    };

    if (field === "currency") {
      nextSettings.currency = value;
    }
    if (field === "currencySymbol") {
      nextSettings.currencySymbol = value;
    }
    if (field === "monthMode") {
      nextSettings.monthMode = value;
    }
    if (field === "customMonthStartDay") {
      nextSettings.customMonthStartDay = Number(value);
    }

    const profiledData = updateLocalProfile({
      ...appData,
      settings: nextSettings
    }, nextProfile);

    actions.updateAppData(profiledData);
  }

  function updateAppearanceSetting(field, value) {
    const displayOnlyFields = ["themeMode", "accentColor"];
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        [field]: value,
        ...(field === "themeMode" ? { darkModeEnabled: value === "dark" } : {})
      }
    }, {
      reason: field === "themeMode" ? "Theme changed" : field === "accentColor" ? "Accent colour changed" : "Display setting changed",
      markDirty: displayOnlyFields.includes(field) ? false : undefined
    });
  }

  function updateBudgetBehaviourSetting(field, value) {
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        [field]: value
      }
    }, { reason: "Budget behaviour setting changed" });
  }

  function updateAccentColour(value) {
    if (!isValidHexColour(value)) return;
    updateAppearanceSetting("accentColor", value.toLowerCase());
  }

  function removeExampleData() {
    if (!confirm("Remove example data? Default categories and accounts will stay.")) return;
    actions.updateAppData({
      ...appData,
      transactions: appData.transactions.filter(item => !item.isExample),
      recurringItems: appData.recurringItems.filter(item => !item.isExample),
      savingsGoals: appData.savingsGoals.filter(item => !item.isExample),
      loans: (appData.loans || []).filter(item => !item.isExample),
      loanEvents: (appData.loanEvents || []).filter(item => !item.isExample),
      closedMonths: appData.closedMonths.filter(item => !item.isExample),
      settings: { ...settings, useExampleData: false }
    });
  }

  async function resetAll() {
    const backupWarning = settings.lastBackupAt
      ? `Last backup: ${formatDateTime(settings.lastBackupAt)}. Continue only if this backup is recent enough.`
      : "No backup has been recorded. Export a backup before resetting unless you are sure.";

    if (!confirm(`${backupWarning}\n\nContinue to reset/delete all data?`)) return;

    const phrase = prompt("Type DELETE to reset all app data.");
    if (phrase !== "DELETE") return;
    await clearAppData();
    actions.updateAppData(getInitialAppData());
    window.location.reload();
  }

  async function exportBackup() {
    const exportedAt = new Date().toISOString();
    const { nextData, filename } = prepareDataForBackupExport(appData, exportedAt);

    try {
      const result = await exportJsonBackup(nextData, exportedAt, filename);
      if (!result.ok) return;
      actions.updateAppData(nextData, { markDirty: false });
    } catch (error) {
      console.error("Backup failed:", error);
      alert("Backup export failed. Try again or use a different browser/download location.");
    }
  }

  async function exportRawData() {
    setRawExportStatus("");
    try {
      const result = await exportRawSavedData();
      if (!result.ok) {
        setRawExportStatus(result.cancelled ? "Raw data export cancelled." : "Raw data export did not complete.");
        return;
      }
      setRawExportStatus(result.method === "save-picker" ? "Raw data saved." : "Raw data downloaded.");
    } catch (error) {
      console.error("Raw data export failed:", error);
      setRawExportStatus("Raw data export failed.");
    }
  }

  async function handleBackupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestorePreview(null);
    setRestorePhrase("");
    setRestoreError("");

    try {
      const preview = await parseBackupFile(file);
      setRestorePreview(preview);
    } catch (error) {
      setRestoreError(error.message || "Could not read this backup file.");
    } finally {
      event.target.value = "";
    }
  }

  async function confirmRestore() {
    if (!restorePreview || restorePhrase !== "RESTORE") return;

    const restoredAt = new Date().toISOString();
    const snapshotCreated = await createEmergencyRestoreSnapshot(appData, "pre-json-restore");
    if (!snapshotCreated && !confirm("Could not create an emergency browser snapshot before restore. Continue replacing current data anyway?")) {
      setRestoreError("Restore cancelled because the emergency snapshot could not be created.");
      return;
    }

    const nextData = prepareRestoredAppData(
      restorePreview.data,
      restorePreview.filename,
      restoredAt,
      restorePreview.meta
    );

    try {
      await restoreReceiptBackupRecords(restorePreview.receiptStorage);
      const stats = await getReceiptStorageStats();
      setReceiptStats(stats);
    } catch (error) {
      console.warn("Receipt files could not be restored:", error);
      alert("Main backup data restored, but receipt files could not be restored. Check receipt storage after restore.");
    }

    actions.updateAppData(nextData, { markDirty: false });
    setRestorePreview(null);
    setRestorePhrase("");
    alert("Backup restored. The app data and any included receipt files have been restored.");
  }

  function updateArrayItem(field, id, patch) {
    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      [field]: (appData[field] || []).map(item => (
        item.id === id ? { ...item, ...patch, updatedAt: now } : item
      ))
    });
    setRuleStatus("Saved import rule change.");
  }

  function removeArrayItem(field, id, label) {
    if (!confirm(`Delete this ${label}?`)) return;
    actions.updateAppData({
      ...appData,
      [field]: (appData[field] || []).filter(item => item.id !== id)
    });
    setRuleStatus(`Deleted ${label}.`);
  }

  function addExternalAccountMapping() {
    const externalName = newExternalName.trim();
    const gbAccountId = newExternalAccountId;

    if (!externalName || !gbAccountId) {
      setRuleStatus("Enter an external name and choose a GH account before adding the mapping.");
      return;
    }

    const alreadyExists = (appData.externalAccountMappings || []).some(mapping => (
      normaliseRuleText(mapping.externalName) === normaliseRuleText(externalName)
    ));

    if (alreadyExists && !confirm("A mapping with this external name already exists. Add another one anyway?")) {
      return;
    }

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      externalAccountMappings: [
        {
          id: createId("external_map"),
          externalName,
          gbAccountId,
          matchType: "contains",
          source: "settings_manual",
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null
        },
        ...(appData.externalAccountMappings || [])
      ]
    });

    setNewExternalName("");
    setNewExternalAccountId("");
    setRuleStatus("Added external account mapping.");
  }

  function addCategoryMatchRule() {
    const matchText = newCategoryMatchText.trim();
    const categoryId = newCategoryId || selectedRuleCategoryId || appData.categories.find(category => category.isActive !== false)?.id || "";
    const category = appData.categories.find(item => item.id === categoryId);

    if (!matchText || !category) {
      setRuleStatus("Enter a match text and choose a category before adding the rule.");
      return;
    }

    const alreadyExists = (appData.importRules || []).some(rule => (
      normaliseRuleText(rule.matchText) === normaliseRuleText(matchText)
      && rule.categoryId === categoryId
    ));

    if (alreadyExists && !confirm("This category already has that match text. Add another one anyway?")) {
      return;
    }

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      importRules: [
        {
          id: createId("import_rule"),
          matchText,
          categoryId,
          transactionType: category.type || "expense",
          source: "settings_manual",
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null
        },
        ...(appData.importRules || [])
      ]
    });

    setNewCategoryMatchText("");
    setNewCategoryId(categoryId);
    setSelectedRuleCategoryId(categoryId);
    setRuleStatus("Added category match text.");
  }

  function getAccountName(accountId) {
    return appData.accounts.find(account => account.id === accountId)?.name || "Unknown account";
  }

  function getCategoryName(categoryId) {
    return appData.categories.find(category => category.id === categoryId)?.name || "Unassigned category";
  }

  function getCategoryType(categoryId) {
    return appData.categories.find(category => category.id === categoryId)?.type || "expense";
  }

  function getCategoryOptions(type) {
    return (appData.categories || []).filter(category => category.type === type && category.isActive !== false);
  }

  const savedCategoryRules = appData.importRules || [];
  const ruleCategories = appData.categories.filter(category => category.isActive !== false);
  const selectedCategoryIdForView = selectedRuleCategoryId || newCategoryId || ruleCategories[0]?.id || "";
  const selectedRuleCategory = appData.categories.find(category => category.id === selectedCategoryIdForView);
  const selectedCategoryRules = savedCategoryRules.filter(rule => rule.categoryId === selectedCategoryIdForView);
  const unassignedCategoryRules = savedCategoryRules.filter(rule => !rule.categoryId || !appData.categories.some(category => category.id === rule.categoryId));


  function addFutureSuggestion(event) {
    event.preventDefault();
    const text = newSuggestionText.trim();
    if (!text) return;

    const now = new Date().toISOString();
    const nextSuggestion = {
      id: createId("sug"),
      text,
      status: "open",
      source: "local_user",
      createdAt: now,
      updatedAt: now
    };

    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        futureSuggestions: [nextSuggestion, ...(settings.futureSuggestions || [])]
      }
    }, { reason: "Future feature suggestion added" });

    setNewSuggestionText("");
  }

  function updateFutureSuggestion(id, patch) {
    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        futureSuggestions: (settings.futureSuggestions || []).map(item => (
          item.id === id ? { ...item, ...patch, updatedAt: now } : item
        ))
      }
    }, { reason: "Future feature suggestion updated" });
  }

  function deleteFutureSuggestion(id) {
    if (!confirm("Delete this suggestion?")) return;
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        futureSuggestions: (settings.futureSuggestions || []).filter(item => item.id !== id)
      }
    }, { reason: "Future feature suggestion deleted" });
  }

  function toggleSettingsSection(sectionId) {
    setActiveSettingsSection(current => current === sectionId ? null : sectionId);
  }

  function sectionClass(sectionId, extraClass = "") {
    return `card settings-accordion-card ${extraClass} ${activeSettingsSection === sectionId ? "is-open" : ""}`;
  }

  function sectionHeaderProps(sectionId) {
    return {
      role: "button",
      tabIndex: 0,
      "aria-expanded": activeSettingsSection === sectionId,
      onClick: () => toggleSettingsSection(sectionId),
      onKeyDown: event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSettingsSection(sectionId);
        }
      }
    };
  }

  function SectionChevron({ sectionId }) {
    return <span className="settings-accordion-chevron" aria-hidden="true">{activeSettingsSection === sectionId ? "−" : "+"}</span>;
  }

  return (
    <div className="page-grid">
      <div className="settings-page-intro">
        <h2>App settings</h2>
        <p className="muted-text">Open one section at a time. Headings expand without turning Settings into one long page.</p>
      </div>

      <section className={sectionClass("profile", "profile-settings-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("profile")}>
          <div>
            <h3>Profile</h3>
            <p className="muted-text">Local profile details for display, currency and month settings. Supabase email/password access is managed in Cloud backup.</p>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">Local profile</span><SectionChevron sectionId="profile" /></div>
        </div>

        <div className="form-grid profile-form-grid">
          <label>
            Username
            <input
              value={profile.username || profile.displayName || ""}
              onChange={event => updateProfileField("username", event.target.value)}
              placeholder="e.g. Archie"
            />
          </label>

          <label>
            Display name
            <input
              value={profile.displayName || ""}
              onChange={event => updateProfileField("displayName", event.target.value)}
              placeholder="e.g. Archie"
            />
          </label>

          <label>
            Email address optional
            <input
              type="email"
              value={profile.email || ""}
              onChange={event => updateProfileField("email", event.target.value)}
              placeholder="Used later for cloud login"
            />
          </label>

          <label>
            Budget/profile name
            <input
              value={profile.profileName || ""}
              onChange={event => updateProfileField("profileName", event.target.value)}
              placeholder="e.g. Personal Budget"
            />
          </label>

          <label>
            Profile type
            <select
              value={profile.profileType || "Personal"}
              onChange={event => updateProfileField("profileType", event.target.value)}
            >
              <option value="Personal">Personal</option>
              <option value="Student">Student</option>
              <option value="Household">Household</option>
              <option value="Shared house">Shared house</option>
              <option value="Family">Family</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            Currency
            <select
              value={profile.currency || settings.currency || "GBP"}
              onChange={event => updateProfileField("currency", event.target.value)}
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label>
            Currency symbol
            <input
              value={profile.currencySymbol || settings.currencySymbol || "£"}
              onChange={event => updateProfileField("currencySymbol", event.target.value)}
              placeholder="£"
            />
          </label>

          <label>
            Month mode
            <select
              value={profile.monthMode || settings.monthMode || "calendar"}
              onChange={event => updateProfileField("monthMode", event.target.value)}
            >
              <option value="calendar">Calendar month</option>
              <option value="custom">Custom/payday month</option>
            </select>
          </label>

          <label>
            Custom month start day
            <input
              type="number"
              min="1"
              max="28"
              value={profile.customMonthStartDay || settings.customMonthStartDay || 1}
              onChange={event => updateProfileField("customMonthStartDay", event.target.value)}
            />
          </label>

          <label className="full-width">
            Notes/details
            <textarea
              value={profile.notes || ""}
              onChange={event => updateProfileField("notes", event.target.value)}
              placeholder="Optional notes, e.g. personal budget, uni house bills, family account, etc."
            />
          </label>
        </div>

        <div className="profile-meta-grid">
          <p><span>Local profile ID</span><strong>{profile.localProfileId || "Not created yet"}</strong></p>
          <p><span>Active profile ID</span><strong>{appData.activeProfileId || profile.localProfileId || "Not set"}</strong></p>
          <p><span>Profiles stored</span><strong>{(appData.profiles || []).length || 1}</strong></p>
          <p><span>Cloud user ID</span><strong>{profile.cloudUserId || "Not connected"}</strong></p>
          <p><span>Login type</span><strong>{profile.localOnly === false ? "Cloud-ready profile" : "Local username only"}</strong></p>
          <p><span>Profile updated</span><strong>{formatDateTime(profile.updatedAt)}</strong></p>
        </div>
      </section>

      <section className={sectionClass("appearance", "appearance-settings-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("appearance")}>
          <div>
            <p className="eyebrow">Display</p>
            <h3>Appearance and dashboard layout</h3>
            <p className="muted-text">These settings are stored locally and only change how the app looks on this device/browser.</p>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">V2.6</span><SectionChevron sectionId="appearance" /></div>
        </div>

        <div className="form-grid appearance-form-grid">
          <label>
            Theme
            <select
              value={settings.themeMode || (settings.darkModeEnabled ? "dark" : "light")}
              onChange={event => updateAppearanceSetting("themeMode", event.target.value)}
            >
              <option value="light">Light mode</option>
              <option value="dark">Dark mode</option>
              <option value="system">Use device setting</option>
            </select>
          </label>

          <label>
            Highlight colour
            <select
              value={settings.accentColor || "#0b5d45"}
              onChange={event => updateAccentColour(event.target.value)}
            >
              {ACCENT_PRESETS.map(preset => (
                <option key={preset.value} value={preset.value}>{preset.name}</option>
              ))}
            </select>
          </label>

          <label>
            Custom highlight colour
            <input
              type="color"
              value={settings.accentColor || "#0b5d45"}
              onChange={event => updateAccentColour(event.target.value)}
              aria-label="Choose custom highlight colour"
            />
          </label>

          <label>
            Default dashboard layout
            <select
              value={settings.dashboardLayout || "full"}
              onChange={event => updateAppearanceSetting("dashboardLayout", event.target.value)}
            >
              <option value="full">Full dashboard</option>
              <option value="simple">Simple money left</option>
              <option value="compact">Compact dashboard</option>
            </select>
          </label>

          <label className="checkbox-label appearance-checkbox-label">
            <input
              type="checkbox"
              checked={settings.backupButtonFlashEnabled !== false}
              onChange={event => updateAppearanceSetting("backupButtonFlashEnabled", event.target.checked)}
            />
            Allow Backup Now button to slowly flash when backup is urgent
          </label>

          <div className="appearance-preview-card full-width">
            <span className="pill">Preview</span>
            <strong>{settings.themeMode === "dark" ? "Dark dashboard" : settings.themeMode === "system" ? "Device-controlled theme" : "Light dashboard"}</strong>
            <small>Highlight colour: {ACCENT_PRESETS.find(preset => preset.value === (settings.accentColor || "#0b5d45"))?.name || "Custom"}</small>
            <div className="accent-preview-row">
              <span className="accent-preview-swatch" style={{ background: settings.accentColor || "#0b5d45" }} />
              <button className="primary-button small" type="button">Example button</button>
              <span className="connection-pill online">Online</span>
            </div>
            <small>Dashboard layout: {settings.dashboardLayout === "simple" ? "Simple money left" : settings.dashboardLayout === "compact" ? "Compact" : "Full"}</small>
            <small>Backup flash: {settings.backupButtonFlashEnabled === false ? "Off" : "On"}</small>
          </div>
        </div>
      </section>

      <section className={sectionClass("budgetBehaviour", "budget-behaviour-settings-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("budgetBehaviour")}>
          <div>
            <p className="eyebrow">Budget logic</p>
            <h3>Budget behaviour</h3>
            <p className="muted-text">Controls the large-expense warning, budget affordability reminder, and budget-left calculation behaviour.</p>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">V2.6.9</span><SectionChevron sectionId="budgetBehaviour" /></div>
        </div>

        <div className="form-grid appearance-form-grid">
          <label>
            Large expense threshold
            <input
              type="number"
              min="0"
              step="1"
              value={settings.largeExpenseThreshold || 200}
              onChange={event => updateBudgetBehaviourSetting("largeExpenseThreshold", Number(event.target.value || 0))}
            />
            <small>CSV import and Add Transaction highlight the exclude-from-budget option above this amount.</small>
          </label>

          <label>
            Budget affordability warning threshold
            <input
              type="number"
              min="0"
              step="1"
              value={settings.budgetAffordabilityThreshold || 100}
              onChange={event => updateBudgetBehaviourSetting("budgetAffordabilityThreshold", Number(event.target.value || 0))}
            />
            <small>Warn when remaining budgets are within this amount of available account money.</small>
          </label>

          <label className="checkbox-label appearance-checkbox-label">
            <input
              type="checkbox"
              checked={settings.budgetAffordabilityWarningsEnabled !== false}
              onChange={event => updateBudgetBehaviourSetting("budgetAffordabilityWarningsEnabled", event.target.checked)}
            />
            Show reminders when budgets are close to not being affordable from linked account balances
          </label>
        </div>
      </section>

      <section className={sectionClass("importRules", "settings-section-entry-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("importRules")}>
          <div>
            <p className="eyebrow">Settings section</p>
            <h3>Import Rules</h3>
            <p className="muted-text">Open this to view, add, edit, or delete what CSV import has remembered. Sections open one at a time to avoid flooding the screen.</p>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">{(appData.importRules || []).length} rules</span><SectionChevron sectionId="importRules" /></div>
        </div>
        <div className="settings-section-summary-grid">
          <div>
            <strong>{(appData.externalAccountMappings || []).length}</strong>
            <span>External account mappings</span>
          </div>
          <div>
            <strong>{(appData.importRules || []).length}</strong>
            <span>Category match texts</span>
          </div>
          <div>
            <strong>{(appData.csvColumnMappings || []).length}</strong>
            <span>Saved CSV formats</span>
          </div>
        </div>
      </section>

      {activeSettingsSection === "importRules" && (
        <section className="card import-rules-settings-card" id="import-rules-manager">
          <div className="section-header compact-header">
            <div>
              <h3>Import Rules Manager</h3>
              <p className="muted-text">Use this when the app has remembered a bank phrase incorrectly, for example “Uni” mapping to the wrong GH account.</p>
            </div>
            <span className="pill">V2.6</span>
          </div>

          {ruleStatus && <div className="import-status-box">{ruleStatus}</div>}

          <div className="import-rules-panel-tabs">
            <button
              className={activeImportRulesPanel === "external" ? "secondary-button active" : "secondary-button"}
              onClick={() => setActiveImportRulesPanel("external")}
            >
              External accounts
            </button>
            <button
              className={activeImportRulesPanel === "categories" ? "secondary-button active" : "secondary-button"}
              onClick={() => setActiveImportRulesPanel("categories")}
            >
              Category match texts
            </button>
            <button
              className={activeImportRulesPanel === "csv" ? "secondary-button active" : "secondary-button"}
              onClick={() => setActiveImportRulesPanel("csv")}
            >
              Saved CSV formats
            </button>
          </div>

          {activeImportRulesPanel === "external" && (
            <div className="rules-manager-panel">
              <div className="section-header compact-header">
                <div>
                  <h4>External account mappings</h4>
                  <p className="muted-text">Bank/CSV names mapped to GH accounts. Example: “Uni” → Chase Savings.</p>
                </div>
                <span className="pill">{(appData.externalAccountMappings || []).length} saved</span>
              </div>

              <div className="manual-rule-add-box">
                <h5>Add external account mapping</h5>
                <div className="manual-rule-add-grid external-add-grid">
                  <label>
                    External name from CSV/bank
                    <input
                      value={newExternalName}
                      onChange={event => setNewExternalName(event.target.value)}
                      placeholder="e.g. Uni, Chase Saver, Monzo Pot"
                    />
                  </label>
                  <label>
                    GH account
                    <select
                      value={newExternalAccountId}
                      onChange={event => setNewExternalAccountId(event.target.value)}
                    >
                      <option value="">Choose account</option>
                      {appData.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </label>
                  <button className="primary-button" onClick={addExternalAccountMapping}>Add mapping</button>
                </div>
              </div>

              {(appData.externalAccountMappings || []).length === 0 ? (
                <p className="muted">No external account mappings saved yet.</p>
              ) : (
                <div className="rule-list-stack">
                  {(appData.externalAccountMappings || []).map(mapping => (
                    <div key={mapping.id} className="rule-edit-row external-account-rule-row">
                      <label>
                        External name from CSV/bank
                        <input
                          value={mapping.externalName || ""}
                          onChange={event => updateArrayItem("externalAccountMappings", mapping.id, { externalName: event.target.value })}
                          placeholder="e.g. Uni, Chase Saver"
                        />
                      </label>
                      <label>
                        GH account
                        <select
                          value={mapping.gbAccountId || ""}
                          onChange={event => updateArrayItem("externalAccountMappings", mapping.id, { gbAccountId: event.target.value })}
                        >
                          <option value="">Choose account</option>
                          {appData.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </label>
                      <div className="rule-readable-summary">
                        <strong>{mapping.externalName || "External name"}</strong>
                        <span>maps to</span>
                        <strong>{mapping.gbAccountId ? getAccountName(mapping.gbAccountId) : "No GH account selected"}</strong>
                      </div>
                      <button className="secondary-button small" onClick={() => removeArrayItem("externalAccountMappings", mapping.id, "external account mapping")}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeImportRulesPanel === "categories" && (
            <div className="rules-manager-panel">
              <div className="section-header compact-header">
                <div>
                  <h4>Category match texts</h4>
                  <p className="muted-text">Choose one category at a time. The app uses these words to suggest categories during CSV import.</p>
                </div>
                <span className="pill">{savedCategoryRules.length} saved</span>
              </div>

              <div className="manual-rule-add-box">
                <h5>Add category match text</h5>
                <div className="manual-rule-add-grid category-add-grid">
                  <label>
                    Category
                    <select
                      value={newCategoryId || selectedCategoryIdForView}
                      onChange={event => {
                        setNewCategoryId(event.target.value);
                        setSelectedRuleCategoryId(event.target.value);
                      }}
                    >
                      {ruleCategories.map(category => (
                        <option key={category.id} value={category.id}>{category.name} ({category.type})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Match text
                    <input
                      value={newCategoryMatchText}
                      onChange={event => setNewCategoryMatchText(event.target.value)}
                      placeholder="e.g. OPENAI, TESCO, NETFLIX"
                    />
                  </label>
                  <button className="primary-button" onClick={addCategoryMatchRule}>Add match text</button>
                </div>
              </div>

              <div className="category-rule-browser">
                <label>
                  View category
                  <select
                    value={selectedCategoryIdForView}
                    onChange={event => setSelectedRuleCategoryId(event.target.value)}
                  >
                    {ruleCategories.map(category => {
                      const count = savedCategoryRules.filter(rule => rule.categoryId === category.id).length;
                      return (
                        <option key={category.id} value={category.id}>{category.name} ({count})</option>
                      );
                    })}
                  </select>
                </label>
              </div>

              {!selectedRuleCategory ? (
                <p className="muted">No categories are available yet.</p>
              ) : (
                <div className="category-rule-group single-category-rule-group">
                  <div className="category-rule-group-header">
                    <div>
                      <h5>{selectedRuleCategory.name}</h5>
                      <p className="muted-text">{selectedRuleCategory.type === "income" ? "Income" : "Expense"} category</p>
                    </div>
                    <span className="pill">{selectedCategoryRules.length} match{selectedCategoryRules.length === 1 ? "" : "es"}</span>
                  </div>

                  {selectedCategoryRules.length === 0 ? (
                    <p className="muted">No match text saved for this category yet.</p>
                  ) : (
                    <div className="category-match-list">
                      {selectedCategoryRules.map(rule => (
                        <div key={rule.id} className="category-match-row">
                          <input
                            value={rule.matchText || ""}
                            onChange={event => updateArrayItem("importRules", rule.id, { matchText: event.target.value })}
                            aria-label={`Match text for ${selectedRuleCategory.name}`}
                            placeholder="e.g. OPENAI"
                          />
                          <button className="secondary-button small" onClick={() => removeArrayItem("importRules", rule.id, "category match text")}>Delete</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {unassignedCategoryRules.length > 0 && (
                <div className="category-rule-group warning-group">
                  <div className="category-rule-group-header">
                    <div>
                      <h5>Unassigned / missing category</h5>
                      <p className="muted-text">These rules point to a category that no longer exists or has not been selected.</p>
                    </div>
                    <span className="pill">{unassignedCategoryRules.length}</span>
                  </div>
                  <div className="category-match-list">
                    {unassignedCategoryRules.map(rule => {
                      const type = rule.transactionType || getCategoryType(rule.categoryId);
                      return (
                        <div key={rule.id} className="category-match-row unassigned-match-row">
                          <input
                            value={rule.matchText || ""}
                            onChange={event => updateArrayItem("importRules", rule.id, { matchText: event.target.value })}
                            placeholder="Match text"
                          />
                          <select
                            value={rule.categoryId || ""}
                            onChange={event => updateArrayItem("importRules", rule.id, { categoryId: event.target.value })}
                          >
                            <option value="">Choose category</option>
                            {getCategoryOptions(type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                          <button className="secondary-button small" onClick={() => removeArrayItem("importRules", rule.id, "category match text")}>Delete</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeImportRulesPanel === "csv" && (
            <div className="rules-manager-panel">
              <div className="section-header compact-header">
                <div>
                  <h4>Saved CSV column mappings</h4>
                  <p className="muted-text">CSV layouts saved after imports so the same bank format maps faster next time.</p>
                </div>
                <span className="pill">{(appData.csvColumnMappings || []).length} saved</span>
              </div>

              {(appData.csvColumnMappings || []).length === 0 ? (
                <p className="muted">No CSV column mappings saved yet.</p>
              ) : (
                <div className="rule-list-stack">
                  {(appData.csvColumnMappings || []).map(mapping => (
                    <div key={mapping.id} className="rule-edit-row csv-mapping-row">
                      <label>
                        Mapping name
                        <input
                          value={mapping.name || mapping.fileName || "CSV format"}
                          onChange={event => updateArrayItem("csvColumnMappings", mapping.id, { name: event.target.value })}
                        />
                      </label>
                      <label>
                        Default account
                        <select
                          value={mapping.accountId || ""}
                          onChange={event => updateArrayItem("csvColumnMappings", mapping.id, { accountId: event.target.value })}
                        >
                          <option value="">No default</option>
                          {appData.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </label>
                      <div className="rule-map-summary">
                        <small>Date: {mapping.columnMap?.date || "—"}</small>
                        <small>Description: {mapping.columnMap?.description || "—"}</small>
                        <small>Amount: {mapping.columnMap?.amount || `${mapping.columnMap?.paidIn || "—"} / ${mapping.columnMap?.paidOut || "—"}`}</small>
                        <small>Balance: {mapping.columnMap?.balance || "—"}</small>
                        <small>Default account: {mapping.accountId ? getAccountName(mapping.accountId) : "None"}</small>
                      </div>
                      <button className="secondary-button small" onClick={() => removeArrayItem("csvColumnMappings", mapping.id, "CSV column mapping")}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className={sectionClass("storage", "storage-health-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("storage")}>
          <div>
            <h3>Storage health</h3>
            <p className="muted-text">Checks the local saved data before bigger storage or cloud-sync changes are added.</p>
          </div>
          <div className="settings-accordion-heading-side"><span className={storageHealth.ok ? "pill storage-ok" : "pill storage-bad"}>{storageHealth.status}</span><SectionChevron sectionId="storage" /></div>
        </div>

        <div className="storage-health-grid">
          <p><span>Storage type</span><strong>{storageHealth.storageType}</strong></p>
          <p><span>localStorage available</span><strong>{storageHealth.localStorageAvailable ? "Yes" : "No"}</strong></p>
          <p><span>Primary record</span><strong>{storageHealth.storageKey}</strong></p>
          <p><span>Approx. app data size</span><strong>{storageHealth.approxKilobytes} KB</strong></p>
          <p><span>localStorage recovery copy</span><strong>{storageHealth.legacyLocalStorageKilobytes} KB</strong></p>
          <p><span>Receipt files</span><strong>{receiptStats.count} file(s)</strong></p>
          <p><span>Receipt storage used</span><strong>{receiptStats.totalMegabytes >= 1 ? `${receiptStats.totalMegabytes} MB` : `${receiptStats.totalKilobytes} KB`}</strong></p>
          <p><span>Browser storage quota</span><strong>{storageHealth.approxLimitMegabytes ? `${storageHealth.approxLimitMegabytes} MB` : "Browser did not report quota"}</strong></p>
          <p><span>Browser storage used</span><strong>{storageHealth.storagePercent !== null && storageHealth.storagePercent !== undefined ? `${storageHealth.storagePercent}%` : "Not reported"}</strong></p>
          <p><span>IndexedDB last saved</span><strong>{formatDateTime(storageHealth.lastSaveAt)}</strong></p>
          <p><span>Persistent storage</span><strong>{persistentStorageStatus || (settings.persistentStorageGranted ? "Granted" : "Not requested")}</strong></p>
          <p><span>App version</span><strong>V{APP_VERSION}</strong></p>
          <p><span>Data version</span><strong>{settings.dataVersion || DATA_SCHEMA_VERSION}</strong></p>
          <p><span>Last backup</span><strong>{formatDateTime(settings.lastBackupAt)}</strong></p>
          <p><span>Unbacked changes</span><strong>{settings.hasUnbackedChanges ? `Yes (${Number(settings.changesSinceBackup || 0)})` : "No"}</strong></p>
          <p><span>Last migration</span><strong>{formatDateTime(storageHealth.lastMigrationRunAt)}</strong></p>
          <p><span>Migration version</span><strong>{storageHealth.lastMigrationPreviousVersion ? `${storageHealth.lastMigrationPreviousVersion} -> ${storageHealth.lastMigrationNewVersion || DATA_SCHEMA_VERSION}` : "No migration recorded"}</strong></p>
          <p><span>Migration warnings</span><strong>{storageHealth.lastMigrationError || storageHealth.lastMigrationWarnings?.join(" ") || "None"}</strong></p>
        </div>

        <div className="row-actions">
          <button type="button" className="secondary-button" onClick={requestPersistentStorage}>
            Request persistent browser storage
          </button>
        </div>
        <p className="muted-text">Persistent storage asks the browser not to automatically clear this app's IndexedDB data. JSON backups are still required.</p>

        <div className={backupReminderClass(backupReminder.level)}>
          <strong>{backupReminder.title}</strong>
          <span>{backupReminder.message}</span>
        </div>

        <WarningList warnings={[...(storageHealth.errors || []), ...(storageHealth.warnings || [])]} />

        <div className="storage-log-panel">
          <div className="section-header compact-header">
            <div>
              <h4>Storage and migration logs</h4>
              <p className="muted-text">Shows IndexedDB migration/load/save problems and safe repair actions. This is for debugging before cloud sync.</p>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary-button small" onClick={refreshStorageLogList}>Refresh logs</button>
              <button type="button" className="secondary-button small danger-text" onClick={clearStorageLogList}>Clear logs</button>
            </div>
          </div>
          {storageLogStatus && <p className="muted-text">{storageLogStatus}</p>}
          <StorageLogList logs={storageLogs} />
        </div>
      </section>

      <section className={sectionClass("cloud", "cloud-backup-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("cloud")}>
          <div>
            <h3>Cloud backup</h3>
            <p className="muted-text">Optional Supabase manual cloud backup. Local IndexedDB remains the main storage.</p>
          </div>
          <div className="settings-accordion-heading-side">
            <span className={cloudSession.signedIn ? "pill storage-ok" : cloudConfigured ? "pill storage-warning" : "pill storage-bad"}>
              {cloudSession.signedIn ? "Signed in" : cloudConfigured ? "Backup available" : "Not available"}
            </span>
            <SectionChevron sectionId="cloud" />
          </div>
        </div>

        {activeSettingsSection === "cloud" && (
          <div className="cloud-backup-panel">
            <div className="backup-warning-box cloud-warning-box">
              <strong>Auth cloud backup mode, not automatic live sync.</strong>
              <ul>
                <li>Data still saves locally in IndexedDB first.</li>
                <li>Cloud backup is an extra safety copy after sign-in.</li>
                <li>Receipt/image cloud backup is intentionally disabled for now to protect the free quota.</li>
                <li>Do not restore from cloud unless you have checked the preview counts.</li>
              </ul>
            </div>

            {!cloudSettings.linkedLocalDataAt && cloudSession.signedIn && (
              <div className="backup-warning-box cloud-warning-box">
                <strong>Existing local data is not linked yet</strong>
                <span>To protect existing users, the app will not upload this browser's saved budget to the signed-in account until you confirm.</span>
                <div className="row-actions">
                  <button type="button" className="primary-button small" onClick={linkLocalDataToCloud}>Link local data and upload first backup</button>
                </div>
              </div>
            )}

            {cloudSettings.cloudConflict && (
              <div className="backup-warning-box danger-box">
                <strong>Newer cloud backup detected</strong>
                <span>{cloudSettings.cloudConflict.message || "Review the latest cloud backup before replacing local or cloud data."}</span>
                <div className="row-actions">
                  <button type="button" className="secondary-button small" onClick={actions.backupNow}>Download local backup first</button>
                  <button type="button" className="secondary-button small" onClick={() => saveCloudSettings({ cloudConflict: null })}>Keep local data</button>
                  <button type="button" className="primary-button small" onClick={previewLatestCloudRestore}>Restore cloud backup</button>
                </div>
              </div>
            )}

            {!cloudConfigured && (
              <div className="backup-warning-box danger-box">
                <strong>Cloud backup is not available for this build.</strong>
                <span>Ask the app owner to enable cloud backup for this deployment.</span>
              </div>
            )}

            <div className="backup-status-grid">
              <div className="backup-status-item">
                <span>Account</span>
                <strong>{cloudSession.signedIn ? getDisplayUsernameFromSession(cloudSession) : "Signed out"}</strong>
                <small>{cloudSession.signedIn ? "Supabase Auth is active on this browser." : "Sign in before using cloud backup."}</small>
                {cloudSession.signedIn ? (
                  <button type="button" className="secondary-button small" onClick={cloudSignOut}>Sign out</button>
                ) : null}
              </div>

              <div className="backup-status-item">
                <span>Cloud backup</span>
                <strong>{!cloudConfigured ? "Not available" : cloudSettings.lastCloudError ? "Failed" : cloudSettings.cloudBackupNeeded ? "Backup needed" : cloudSettings.lastCloudBackupAt ? "Up to date" : "Not backed up yet"}</strong>
                <small>Last backup: {formatDateTime(cloudSettings.lastCloudBackupAt)}</small>
              </div>

              <div className="backup-status-item">
                <span>Local backup</span>
                <strong>{settings.lastBackupAt ? "Available" : "Recommended"}</strong>
                <small>Last local backup: {formatDateTime(settings.lastBackupAt)}</small>
              </div>
            </div>

            {!cloudSession.signedIn ? (
              <div className="restore-preview-box">
                <div className="section-header compact-header">
                  <div>
                    <h4>Sign in</h4>
                    <p className="muted-text">Use your email or username. Passwords are checked by Supabase Auth and are not stored in app data.</p>
                  </div>
                </div>
                <div className="cloud-setup-grid">
                  <label>
                    Email or username
                    <input
                      value={cloudForm.loginIdentifier}
                      onChange={event => setCloudForm(prev => ({ ...prev, loginIdentifier: event.target.value }))}
                      placeholder="you@example.com or yourusername"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={cloudPassword}
                      onChange={event => setCloudPassword(event.target.value)}
                      placeholder="Not saved in app data"
                    />
                  </label>
                </div>
                <div className="row-actions cloud-action-row">
                  <button type="button" className="primary-button" onClick={cloudSignIn} disabled={!cloudConfigured}>Sign in</button>
                  <button type="button" className="secondary-button" onClick={() => setCloudStatus("Use the login screen to create a new account if you are signed out.")}>Create account</button>
                </div>
              </div>
            ) : null}

            {cloudStatus && <p className="cloud-status-message">{cloudStatus}</p>}

            <div className="restore-preview-box">
              <div className="section-header compact-header">
                <div>
                  <h4>Cloud backup</h4>
                  <p className="muted-text">Cloud backup is an extra safety copy. Local storage remains the working source.</p>
                </div>
              </div>
              <div className="storage-health-grid cloud-status-grid">
                <p><span>Enabled</span><strong>{cloudSettings.enabled ? "Yes" : "No"}</strong></p>
                <p><span>Last auto backup</span><strong>{formatDateTime(cloudSettings.lastAutoCloudBackupAt)}</strong></p>
                <p><span>Local changes waiting</span><strong>{cloudSettings.cloudBackupNeeded ? "Yes" : "No"}</strong></p>
                <p><span>Last restore</span><strong>{formatDateTime(cloudSettings.lastCloudRestoreAt)}</strong></p>
                <p><span>Last error</span><strong>{cloudSettings.lastCloudError || "None"}</strong></p>
              </div>
              <div className="cloud-sync-actions">
                <button type="button" className="primary-button" onClick={uploadCloudBackupNow} disabled={!cloudSession.signedIn || !cloudConfigured}>
                  Back up now
                </button>
                <button type="button" className="secondary-button" onClick={previewLatestCloudRestore} disabled={!cloudSession.signedIn || !cloudConfigured}>
                  Restore latest cloud backup
                </button>
                <button type="button" className="secondary-button" onClick={refreshCloudBackupList} disabled={!cloudSession.signedIn || !cloudConfigured}>
                  Refresh cloud backup list
                </button>
              </div>
            </div>

            <div className="restore-preview-box">
              <div className="section-header compact-header">
                <div>
                  <h4>Local backup</h4>
                  <p className="muted-text">Download a JSON backup before major changes or cloud restores.</p>
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={actions.backupNow}>Download local JSON backup</button>
              </div>
            </div>

            <details className="restore-preview-box">
              <summary><strong>Advanced / developer info</strong></summary>
              <div className="storage-health-grid cloud-status-grid">
                <p><span>App version</span><strong>V{APP_VERSION}</strong></p>
                <p><span>Data version</span><strong>{settings.dataVersion || DATA_SCHEMA_VERSION}</strong></p>
                <p><span>Cloud table</span><strong>{cloudSettings.tableName || "gh_cloud_backups"}</strong></p>
                <p><span>Cloud records listed</span><strong>{cloudBackups.length}</strong></p>
                <p><span>Storage status</span><strong>{storageHealth.status}</strong></p>
                <p><span>Last migration</span><strong>{formatDateTime(storageHealth.lastMigrationRunAt)}</strong></p>
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button small" onClick={() => setShowCloudSql(value => !value)}>
                  {showCloudSql ? "Hide Supabase SQL" : "Show Supabase SQL setup"}
                </button>
              </div>
              {showCloudSql && (
                <div className="cloud-sql-box">
                  <p className="muted-text">Run this in Supabase SQL Editor. It creates the backup table, profile table, resolver RPC and Row Level Security policies.</p>
                  <textarea readOnly value={cloudSetupSql} rows={18} />
                </div>
              )}
            </details>

            <div className="section-header compact-header">
              <div>
                <h4>Cloud backups</h4>
                <p className="muted-text">Listed backups belong to the signed-in Supabase account.</p>
              </div>
              <span className="pill">{cloudBackups.length}</span>
            </div>

            <CloudBackupRows
              rows={cloudBackups}
              onPreview={previewCloudRestore}
              onDownload={downloadCloudBackup}
              onDelete={deleteCloudBackup}
            />

            {cloudRestorePreview && (
              <div className="restore-preview-box cloud-restore-preview-box">
                <div className="section-header">
                  <div>
                    <h4>Cloud restore preview</h4>
                    <p className="muted-text">This will replace the current local IndexedDB data. Check counts first.</p>
                  </div>
                  <button className="icon-button" onClick={() => { setCloudRestorePreview(null); setCloudRestorePhrase(""); }}>×</button>
                </div>

                <div className="backup-meta-grid">
                  <p><span>Cloud backup</span><strong>{cloudRestorePreview.row?.backup_label || cloudRestorePreview.filename}</strong></p>
                  <p><span>Created</span><strong>{formatDateTime(cloudRestorePreview.row?.client_generated_at || cloudRestorePreview.row?.created_at)}</strong></p>
                  <p><span>Backup format</span><strong>{cloudRestorePreview.meta.backupFormatVersion}</strong></p>
                  <p><span>App version</span><strong>{cloudRestorePreview.meta.appVersion}</strong></p>
                </div>

                <WarningList warnings={[...cloudRestorePreview.warnings, ...buildRestoreComparisonWarnings(appData, cloudRestorePreview)]} />
                <CountGrid counts={cloudRestorePreview.counts} />

                <label className="restore-confirm-label">
                  Type CLOUD RESTORE to replace current local data
                  <input
                    value={cloudRestorePhrase}
                    onChange={event => setCloudRestorePhrase(event.target.value)}
                    placeholder="CLOUD RESTORE"
                  />
                </label>

                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => { setCloudRestorePreview(null); setCloudRestorePhrase(""); }}>Cancel</button>
                  <button
                    className="danger-button"
                    onClick={confirmCloudRestore}
                    disabled={cloudRestorePhrase !== "CLOUD RESTORE"}
                  >
                    Replace local data with this cloud backup
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={sectionClass("validation", "data-validation-card")}>
        <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("validation")}>
          <div>
            <h3>Data validation and repair</h3>
            <p className="muted-text">Checks links between transactions, accounts, categories, budgets, savings goals, recurring items and loans.</p>
          </div>
          <div className="settings-accordion-heading-side">
            <span className={validationReport?.issues?.length ? "pill storage-bad" : "pill storage-ok"}>
              {validationReport ? `${validationReport.summary.totalIssues} issue(s)` : "Not checked"}
            </span>
            <SectionChevron sectionId="validation" />
          </div>
        </div>

        <div className="row-actions">
          <button type="button" className="primary-button" onClick={runDataValidation}>Check app data</button>
          <button
            type="button"
            className="secondary-button"
            onClick={repairValidationIssues}
            disabled={!validationReport || !validationReport.summary.repairableCount}
          >
            Repair safe issues
          </button>
        </div>

        {validationStatus && <p className="storage-validation-status">{validationStatus}</p>}

        <div className="storage-health-grid validation-summary-grid">
          <p><span>Last check</span><strong>{formatDateTime(settings.lastValidationReportAt)}</strong></p>
          <p><span>Last repair</span><strong>{formatDateTime(settings.lastValidationRepairAt)}</strong></p>
          <p><span>Last repair count</span><strong>{settings.lastValidationRepairCount ?? 0}</strong></p>
          <p><span>Remaining last issue count</span><strong>{settings.lastValidationIssueCount ?? "Not checked"}</strong></p>
        </div>

        <ValidationIssueList report={validationReport} />
      </section>

      <section className={sectionClass("backup", "backup-status-card")}>
        <div className="section-header settings-accordion-heading" {...sectionHeaderProps("backup")}>
          <div>
            <h3>Data backup and restore</h3>
            <p className="muted-text">Export a full JSON backup before major changes, before resetting data, or before moving to another computer.</p>
          </div>
          <div className="settings-accordion-heading-side"><span className="pill">V{APP_VERSION}</span><SectionChevron sectionId="backup" /></div>
        </div>

        <div className="backup-status-grid">
          <div className="backup-status-item">
            <span>Last backup</span>
            <strong>{formatDateTime(settings.lastBackupAt)}</strong>
            {settings.lastBackupFilename && <small>{settings.lastBackupFilename}</small>}
          </div>
          <div className="backup-status-item">
            <span>Last restore</span>
            <strong>{formatDateTime(settings.lastRestoredAt)}</strong>
            {settings.lastRestoredFilename && <small>{settings.lastRestoredFilename}</small>}
          </div>
          <div className="backup-status-item">
            <span>Backup reminder</span>
            <strong>{backupReminder.title}</strong>
            <small>{backupReminder.ageDays === null ? "No reliable backup age" : `${backupReminder.ageDays} day(s) old`}</small>
          </div>
          <div className="backup-status-item">
            <span>Changes since backup</span>
            <strong>{Number(settings.changesSinceBackup || 0)}</strong>
            <small>{settings.hasUnbackedChanges ? "Browser close warning active" : "No unbacked changes"}</small>
          </div>
        </div>

        <h4>Current data summary</h4>
        <CountGrid counts={currentCounts} />

        <div className="backup-actions-row">
          <button className="primary-button" onClick={exportBackup}>Export full backup</button>
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>Import / restore backup</button>
          <button className="secondary-button" onClick={exportRawData}>Export emergency raw data</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={handleBackupFile}
          />
        </div>

        {rawExportStatus && <p className="muted-text">{rawExportStatus}</p>}

        {restoreError && (
          <div className="restore-error-box">
            <strong>Restore failed</strong>
            <span>{restoreError}</span>
          </div>
        )}

        {restorePreview && (
          <div className="restore-preview-box">
            <div className="section-header">
              <div>
                <h4>Backup preview</h4>
                <p className="muted-text">Check this before restoring. Restore replaces all current data in this browser.</p>
              </div>
              <button className="icon-button" onClick={() => { setRestorePreview(null); setRestorePhrase(""); }}>×</button>
            </div>

            <div className="backup-meta-grid">
              <p><span>File</span><strong>{restorePreview.filename}</strong></p>
              <p><span>Exported</span><strong>{formatDateTime(restorePreview.meta.exportedAt)}</strong></p>
              <p><span>Backup format</span><strong>{restorePreview.meta.backupFormatVersion}</strong></p>
              <p><span>App version</span><strong>{restorePreview.meta.appVersion}</strong></p>
              <p><span>Data version</span><strong>{restorePreview.meta.dataSchemaVersion}</strong></p>
              <p><span>Source</span><strong>{restorePreview.meta.source}</strong></p>
              <p><span>Receipt files in backup</span><strong>{restorePreview.counts?.indexedDbReceipts || 0}</strong></p>
              <p><span>Profile</span><strong>{restorePreview.profile?.displayName || restorePreview.profile?.profileName || "No profile name"}</strong></p>
            </div>

            <WarningList warnings={[...restorePreview.warnings, ...comparisonWarnings]} />

            <CountGrid counts={restorePreview.counts} />

            <label className="restore-confirm-label">
              Type RESTORE to replace current data
              <input
                value={restorePhrase}
                onChange={event => setRestorePhrase(event.target.value)}
                placeholder="RESTORE"
              />
            </label>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setRestorePreview(null); setRestorePhrase(""); }}>Cancel</button>
              <button
                className="danger-button"
                onClick={confirmRestore}
                disabled={restorePhrase !== "RESTORE"}
              >
                Replace current data with this backup
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={sectionClass("install", "pwa-install-card settings-install-entry")}>
        <div className="section-header settings-accordion-heading" {...sectionHeaderProps("install")}>
          <div>
            <h3>Install app and offline mode</h3>
            <p className="muted-text">Install, update and use the local app shell before cloud sync is built.</p>
          </div>
          <div className="settings-accordion-heading-side"><img className="settings-app-icon compact" src="/icons/gb-icon-192.png" alt="" /><SectionChevron sectionId="install" /></div>
        </div>

        {activeSettingsSection === "install" && <PwaInstallCard pwaInstall={actions.pwaInstall} actions={actions} embedded />}
      </section>

      <section className={sectionClass("exampleData")}>
        <div className="section-header settings-accordion-heading" {...sectionHeaderProps("exampleData")}>
          <div>
            <h3>Example data</h3>
            <p className="muted-text">Remove fake transactions and example goals while keeping default categories/accounts.</p>
          </div>
          <SectionChevron sectionId="exampleData" />
        </div>
        {activeSettingsSection === "exampleData" && <button className="secondary-button" onClick={removeExampleData}>Remove example data</button>}
      </section>

      <section className={sectionClass("danger", "danger-zone settings-accordion-danger")}>
        <div className="section-header settings-accordion-heading" {...sectionHeaderProps("danger")}>
          <div>
            <h3>Danger zone</h3>
            <p className="muted-text">Reset/delete all data. Export a backup first if you want a recovery copy.</p>
          </div>
          <SectionChevron sectionId="danger" />
        </div>
        {activeSettingsSection === "danger" && <button className="danger-button" onClick={resetAll}>Reset all data</button>}
      </section>

      <section className={sectionClass("future")}>
        <div className="section-header settings-accordion-heading" {...sectionHeaderProps("future")}>
          <div>
            <h3>Future features</h3>
            <p className="muted-text">See what is built now and what is still planned.</p>
          </div>
          <SectionChevron sectionId="future" />
        </div>
        {activeSettingsSection === "future" && (
          <div className="future-feature-panel">
            <p className="muted">Full automatic cloud sync and desktop app wrapper are planned later. Manual Supabase cloud backup, bank CSV import, import-rules management, backup restore/data safety, reports upgrades, IndexedDB receipt storage, dark mode, dashboard layouts, local profile setup, install prompts, offline/update handling, and loan tracking are now available.</p>

            <div className="suggestion-section">
              <div>
                <h4>Suggestions</h4>
                <p className="muted-text">Local list for ideas you want to remember. Later this can become a user feedback/suggestion inbox.</p>
              </div>

              <form className="suggestion-form" onSubmit={addFutureSuggestion}>
                <input
                  type="text"
                  value={newSuggestionText}
                  onChange={event => setNewSuggestionText(event.target.value)}
                  placeholder="e.g. Add stock watchlist dashboard"
                />
                <button className="primary-button">Add suggestion</button>
              </form>

              {(settings.futureSuggestions || []).length === 0 ? (
                <p className="muted">No suggestions saved yet.</p>
              ) : (
                <div className="suggestion-list">
                  {(settings.futureSuggestions || []).map(item => (
                    <div key={item.id} className={`suggestion-row ${item.status === "done" ? "done" : ""}`}>
                      <div>
                        <strong>{item.text}</strong>
                        <small>{item.status === "done" ? "Done" : "Open"} · added {item.createdAt ? item.createdAt.slice(0, 10) : "unknown date"}</small>
                      </div>
                      <div className="row-actions">
                        <button type="button" className="secondary-button small" onClick={() => updateFutureSuggestion(item.id, { status: item.status === "done" ? "open" : "done" })}>{item.status === "done" ? "Reopen" : "Mark done"}</button>
                        <button type="button" className="danger-button small" onClick={() => deleteFutureSuggestion(item.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
