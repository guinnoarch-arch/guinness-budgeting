import AsyncButton from "../common/AsyncButton.jsx";
import { buildRestoreComparisonWarnings } from "../../services/storageService.js";
import { CountGrid, WarningList, formatDateTime } from "./settingsHelpers.jsx";
import { X } from "lucide-react";

// What a chosen cloud backup contains, and the confirm step for restoring it.
export function CloudRestorePreview({ appData, cloudRestorePhrase, cloudRestorePreview, confirmCloudRestore, setCloudRestorePhrase, setCloudRestorePreview }) {
  return (
    <div className="restore-preview-box cloud-restore-preview-box">
      <div className="section-header">
        <div>
          <h4>Cloud restore preview</h4>
          <p className="muted-text">This replaces the budget saved on this device. Check the counts first.</p>
        </div>
        <button className="icon-button" onClick={() => { setCloudRestorePreview(null); setCloudRestorePhrase(""); }} aria-label="Close"><X size={18} aria-hidden="true" /></button>
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
        <AsyncButton busyLabel="Restoring…"
          className="danger-button"
          onClick={confirmCloudRestore}
          disabled={cloudRestorePhrase !== "CLOUD RESTORE"}
        >
          Replace local data with this cloud backup
        </AsyncButton>
      </div>
    </div>
  );
}
