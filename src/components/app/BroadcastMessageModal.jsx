const BROADCAST_SEVERITY_LABEL = { info: "Message from the admin", warning: "Notice from the admin", urgent: "Urgent notice from the admin" };

export default function BroadcastMessageModal({ broadcast, onDismiss }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal-card broadcast-message-modal broadcast-${broadcast.severity || "info"}`}>
        <div className="section-header">
          <h2>{BROADCAST_SEVERITY_LABEL[broadcast.severity] || BROADCAST_SEVERITY_LABEL.info}</h2>
          <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss">×</button>
        </div>
        <p>{broadcast.message}</p>
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onDismiss}>Got it</button>
        </div>
      </div>
    </div>
  );
}
