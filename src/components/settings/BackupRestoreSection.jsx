import { useRef, useState } from "react";
import { logError } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { APP_VERSION, buildRestoreComparisonWarnings, exportRawSavedData, getBackupCounts, parseBackupFile, prepareRestoredAppData } from "../../services/storageService.js";
import { getReceiptStorageStats, restoreReceiptBackupRecords } from "../../services/receiptStorageService.js";
import { CountGrid, WarningList, createEmergencyRestoreSnapshot, formatDateTime } from "./settingsHelpers.jsx";

export default function BackupRestoreSection({ appData, actions, backupReminder, setReceiptStats, settings, accordion }) {
  const { sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const fileInputRef = useRef(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  const [restorePhrase, setRestorePhrase] = useState("");
  const [rawExportStatus, setRawExportStatus] = useState("");
  const currentCounts = getBackupCounts(appData);

  const comparisonWarnings = restorePreview
    ? buildRestoreComparisonWarnings(appData, restorePreview)
    : [];

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
      logError("Raw data export failed", error);
      setRawExportStatus("The raw data couldn't be downloaded. Try again, or use a different browser.");
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
      setRestoreError(getErrorMessage(error, "That file couldn't be read as a backup. Choose a .json backup file exported from this app."));
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

    let receiptsRestored;
    try {
      await restoreReceiptBackupRecords(restorePreview.receiptStorage);
      const stats = await getReceiptStorageStats();
      setReceiptStats(stats);
      receiptsRestored = true;
    } catch {
      receiptsRestored = false;
    }

    actions.updateAppData(nextData, { markDirty: false });
    setRestorePreview(null);
    setRestorePhrase("");
    actions.notify(receiptsRestored
      ? "Backup restored."
      : "Backup restored, but the receipt files in it couldn't be restored. Your transactions are fine; reattach any receipts you need.", 8000);
  }

  return (
    <section className={sectionClass("backup", "backup-status-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("backup")}>
        <div>
          <h3>Data backup and restore</h3>
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
        <AsyncButton busyLabel="Saving backup…" className="primary-button" onClick={actions.backupNow}>Export full backup</AsyncButton>
        <button className="secondary-button" onClick={() => fileInputRef.current?.click()}>Import / restore backup</button>
        <AsyncButton busyLabel="Exporting…" className="secondary-button" onClick={exportRawData}>Export emergency raw data</AsyncButton>
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
            <AsyncButton busyLabel="Restoring…"
              className="danger-button"
              onClick={confirmRestore}
              disabled={restorePhrase !== "RESTORE"}
            >
              Replace current data with this backup
            </AsyncButton>
          </div>
        </div>
      )}
    </section>
  );
}
