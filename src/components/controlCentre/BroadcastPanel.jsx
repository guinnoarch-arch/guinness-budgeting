import AsyncButton from "../common/AsyncButton.jsx";

// Sending or clearing the message shown to every user.
export function BroadcastPanel({ appNotices, broadcastDraft, broadcastSeverity, broadcastStatus, clearBroadcastMessage, sendBroadcastMessage, setBroadcastDraft, setBroadcastSeverity }) {
  return (
    <div className="card control-panel">
      <div className="panel-heading">
        <div>
          <h3>Broadcast message</h3>
          <p>Pops up on every signed-in user's screen until they dismiss it.</p>
        </div>
      </div>
      {appNotices.broadcast ? (
        <div className={`cloud-status-message compact-status broadcast-${appNotices.broadcast.severity}`}>
          Active ({appNotices.broadcast.severity}): {appNotices.broadcast.message}
        </div>
      ) : (
        <p className="muted-text">No broadcast message is currently active.</p>
      )}
      <form className="suggestion-form" onSubmit={sendBroadcastMessage}>
        <textarea
          value={broadcastDraft}
          onChange={event => setBroadcastDraft(event.target.value)}
          placeholder="e.g. New transfer linking feature shipped today - see Import for details."
          rows={2}
          required
        />
        <select value={broadcastSeverity} onChange={event => setBroadcastSeverity(event.target.value)}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="urgent">Urgent</option>
        </select>
        <button className="primary-button" type="submit">Send to all users</button>
      </form>
      {appNotices.broadcast && (
        <div className="row-actions">
          <AsyncButton busyLabel="Clearing…" type="button" className="secondary-button small" onClick={clearBroadcastMessage}>Clear active message</AsyncButton>
        </div>
      )}
      {broadcastStatus && <p className="cloud-status-message compact-status">{broadcastStatus}</p>}
    </div>
  );
}
