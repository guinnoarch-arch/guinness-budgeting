// Small display pieces used on the Control Centre page.

function statusClass(ok) {
  return ok ? "status-ok" : "status-warning";
}

export function ControlStat({ label, value, detail }) {
  return (
    <div className="control-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function SecurityCheck({ label, ok, detail }) {
  return (
    <div className={`security-check ${statusClass(ok)}`}>
      <span>{ok ? "OK" : "Check"}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function StatusBadge({ children, tone = "" }) {
  return <span className={`pill admin-status-badge ${tone}`.trim()}>{children}</span>;
}
