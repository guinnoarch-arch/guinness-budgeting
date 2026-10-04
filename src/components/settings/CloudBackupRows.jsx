import { formatDateTime } from "./settingsHelpers.jsx";

export function CloudBackupRows({ rows, onPreview, onDownload, onDelete }) {
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
