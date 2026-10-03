// The notifications drop-down in the header.
export function NotificationPanel({ notifications, setActivePage, setShowNotifications }) {
  return (
    <div className="notification-panel" role="dialog" aria-label="Notifications">
      <div className="notification-panel-header">
        <strong>Notifications</strong>
        <button type="button" className="text-button" onClick={() => setShowNotifications(false)}>Close</button>
      </div>
      {notifications.length === 0 ? (
        <p className="muted">No upcoming bill warnings right now.</p>
      ) : (
        <div className="notification-list">
          {notifications.map(item => (
            <button
              key={item.id}
              type="button"
              className={`notification-row ${item.type}`}
              onClick={() => {
                setShowNotifications(false);
                if (item.actionPage) setActivePage(item.actionPage);
              }}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{item.message}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
