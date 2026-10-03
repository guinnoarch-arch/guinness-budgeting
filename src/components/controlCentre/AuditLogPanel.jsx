import { formatDateTime } from "./controlCentreFormat.js";
// Recent admin actions.
export function AuditLogPanel({ auditLog, auditStatus }) {
  return (
    <div className="card control-panel">
      <div className="panel-heading">
        <div>
          <h3>Audit log</h3>
          <p>Recent server-side admin changes.</p>
        </div>
      </div>
      <div className="admin-audit-list">
        {auditStatus && <p className="cloud-status-message compact-status warning-status">{auditStatus}</p>}
        {auditLog.length === 0 ? (
          <p className="muted-text">No admin actions recorded yet.</p>
        ) : (
          auditLog.map(entry => (
            <div className="admin-audit-row" key={entry.id || `${entry.action}-${entry.created_at}`}>
              <strong>{entry.action}</strong>
              <span>{entry.actor_email || "unknown"} - {formatDateTime(entry.created_at)}</span>
              {entry.details && <small>{JSON.stringify(entry.details)}</small>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
