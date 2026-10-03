import { APP_VERSION, DATA_SCHEMA_VERSION } from "../../services/storageService.js";
import { formatDateTime } from "./settingsHelpers.jsx";

// Technical details about the cloud connection, for troubleshooting.
export function CloudDeveloperInfo({ cloudBackups, cloudSettings, cloudSetupSql, setShowCloudSql, settings, showCloudSql, storageHealth }) {
  return (
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
  );
}
