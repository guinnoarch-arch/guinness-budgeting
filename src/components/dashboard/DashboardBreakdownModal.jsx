

export function DashboardBreakdownModal({ title, rows, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card breakdown-modal">
        <div className="section-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose}>x</button>
        </div>
        <div className="profile-meta-grid">
          {rows.map(row => (
            <p key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
