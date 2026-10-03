import { useState } from "react";
import { logError } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { exportRawSavedData, parseBackupFile, prepareRestoredAppData } from "../../services/storageService.js";
import PhoneModeToggle from "./PhoneModeToggle.jsx";

// Shown when saved data exists but couldn't be read safely. Nothing is
// overwritten until the person chooses an option here.
export default function StorageRecoveryScreen({ error, phoneMode, onTogglePhoneMode, onRestoreBackup, onStartFresh }) {
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function exportRawBackup() {
    setIsBusy(true);
    setStatus("Preparing emergency raw storage export...");
    try {
      const result = await exportRawSavedData();
      setStatus(result.ok ? "Emergency raw storage export saved." : "Export was cancelled.");
    } catch (exportError) {
      logError("Emergency raw storage export failed", exportError);
      setStatus(getErrorMessage(exportError, "Emergency export failed. Try again in a moment."));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBackupFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsBusy(true);
    setStatus("Checking backup file...");
    try {
      const preview = await parseBackupFile(file);
      const restoredAt = new Date().toISOString();
      const restoredData = prepareRestoredAppData(preview.data, preview.filename, restoredAt, preview.meta);
      onRestoreBackup(restoredData);
      setStatus("Backup restored.");
    } catch (restoreError) {
      logError("Recovery restore failed", restoreError);
      setStatus(getErrorMessage(restoreError, "Couldn't restore that backup file. Try again in a moment."));
    } finally {
      setIsBusy(false);
    }
  }

  function confirmStartFresh() {
    const phrase = prompt("Only start fresh if you are sure there is no local data to recover. Type START FRESH to continue.");
    if (phrase === "START FRESH") onStartFresh();
  }

  return (
    <main className={`storage-recovery-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card storage-recovery-card">
        <div className="recovery-top-row">
          <div>
            <p className="eyebrow">Storage recovery</p>
            <h1>Saved data was not loaded</h1>
          </div>
          <PhoneModeToggle phoneMode={phoneMode} onToggle={onTogglePhoneMode} />
        </div>

        <p className="muted-text">
          The app did not replace your saved data with defaults. This screen appears when browser storage could not be read safely.
        </p>

        <div className="backup-warning-box danger-box">
          <strong>Local data is being protected</strong>
          <span>Do not reset the app unless you have a backup or you are sure this browser has no budget data to recover.</span>
        </div>

        <div className="backup-warning-box">
          <strong>Recovery options</strong>
          <span>Export raw browser storage first, then restore a JSON backup. Cloud backup restore is available after you get back into the app and sign in.</span>
        </div>

        {error?.message && (
          <details className="technical-details">
            <summary>Technical details</summary>
            <small>{error.message}</small>
          </details>
        )}

        <div className="backup-actions-row">
          <button type="button" className="secondary-button" onClick={exportRawBackup} disabled={isBusy}>
            Export raw storage
          </button>
          <label className="secondary-button recovery-file-button">
            Restore JSON backup
            <input type="file" accept="application/json,.json" onChange={handleBackupFile} disabled={isBusy} />
          </label>
          <button type="button" className="primary-button" onClick={() => window.location.reload()} disabled={isBusy}>
            Retry loading data
          </button>
        </div>

        <div className="row-actions">
          <button type="button" className="text-button danger-text" onClick={confirmStartFresh} disabled={isBusy}>
            Start fresh only if no data needs recovery
          </button>
        </div>

        {status && <p className="cloud-status-message">{status}</p>}
      </section>
    </main>
  );
}
