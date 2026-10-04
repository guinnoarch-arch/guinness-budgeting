import { getErrorMessage } from "../../utils/errors.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { APP_VERSION, DATA_SCHEMA_VERSION, enablePersistentBrowserStorage } from "../../services/storageService.js";
import { clearStorageLogs } from "../../services/indexedDbStorageService.js";
import { WarningList, formatDateTime } from "./settingsHelpers.jsx";

function StorageLogList({ logs }) {
  if (!logs || logs.length === 0) {
    return <p className="muted-text">No storage or migration logs yet.</p>;
  }

  return (
    <div className="storage-log-list" tabIndex={0} role="region" aria-label="Storage log">
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

function backupReminderClass(level) {
  if (level === "danger") return "storage-reminder danger";
  if (level === "warning") return "storage-reminder warning";
  if (level === "notice") return "storage-reminder notice";
  return "storage-reminder ok";
}

export default function StorageHealthSection({ appData, actions, backupReminder, persistentStorageStatus, receiptStats, refreshStorageLogList, setPersistentStorageStatus, setStorageLogStatus, setStorageLogs, settings, storageHealth, storageLogStatus, storageLogs, accordion }) {
  const { sectionClass, sectionHeaderProps, SectionChevron } = accordion;

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

  async function clearStorageLogList() {
    if (!confirm("Clear storage and migration logs? This does not delete budget data.")) return;
    try {
      await clearStorageLogs();
      setStorageLogs([]);
      setStorageLogStatus("Storage logs cleared.");
    } catch (error) {
      setStorageLogStatus(getErrorMessage(error, "Couldn't clear storage logs. Try again in a moment."));
    }
  }

  return (
    <section className={sectionClass("storage", "storage-health-card")}>
      <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("storage")}>
        <div>
          <h3>Storage health</h3>
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
        <AsyncButton busyLabel="Requesting…" type="button" className="secondary-button" onClick={requestPersistentStorage}>
          Request persistent browser storage
        </AsyncButton>
      </div>
      <p className="muted-text">Asks the browser not to clear this app's saved data on its own. Keep exporting backups as well.</p>

      <div className={backupReminderClass(backupReminder.level)}>
        <strong>{backupReminder.title}</strong>
        <span>{backupReminder.message}</span>
      </div>

      <WarningList warnings={[...(storageHealth.errors || []), ...(storageHealth.warnings || [])]} />

      <div className="storage-log-panel">
        <div className="section-header compact-header">
          <div>
            <h4>Storage and migration logs</h4>
          </div>
          <div className="row-actions">
            <AsyncButton busyLabel="Refreshing…" type="button" className="secondary-button small" onClick={refreshStorageLogList}>Refresh logs</AsyncButton>
            <AsyncButton busyLabel="Clearing…" type="button" className="secondary-button small danger-text" onClick={clearStorageLogList}>Clear logs</AsyncButton>
          </div>
        </div>
        {storageLogStatus && <p className="muted-text">{storageLogStatus}</p>}
        <StorageLogList logs={storageLogs} />
      </div>
    </section>
  );
}
