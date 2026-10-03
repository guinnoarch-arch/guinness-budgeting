import { formatDateTime } from "./controlCentreFormat.js";
import AsyncButton from "../common/AsyncButton.jsx";

// Feature suggestions sent in by users, with their status.
export function SuggestionsAdminPanel({ refreshSuggestions, setSuggestionFilter, suggestionFilter, suggestionStatus, suggestions, updateSuggestion }) {
  return (
    <div className="card control-panel users-admin-panel">
      <div className="panel-heading admin-users-heading">
        <div>
          <h3>Feature suggestions</h3>
          <p>Safe user-submitted app ideas. No financial records are shown here.</p>
        </div>
        <AsyncButton busyLabel="Refreshing…" type="button" className="secondary-button small" onClick={() => refreshSuggestions()}>Refresh</AsyncButton>
      </div>

      <div className="admin-user-tools">
        <div className="segmented-control admin-filter-tabs" role="group" aria-label="Suggestion filter">
          {["all", "new", "reviewed", "planned", "in_progress", "done", "rejected"].map(key => (
            <button
              key={key}
              type="button"
              className={suggestionFilter === key ? "active" : ""}
              onClick={() => setSuggestionFilter(key)}
            >
              {key === "all" ? "All" : key.replace("_", " ").replace(/^\w/, char => char.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {suggestionStatus && <p className="cloud-status-message compact-status warning-status">{suggestionStatus}</p>}

      <div className="suggestion-list">
        {suggestions.length === 0 ? (
          <p className="muted-text">No feature suggestions match this filter.</p>
        ) : suggestions.map(item => (
          <div className="suggestion-row" key={item.id}>
            <div>
              <strong>{item.message}</strong>
              <small>
                {item.submitted_username || item.submitted_email || "Unknown user"} - {formatDateTime(item.created_at)}
              </small>
              <small>Votes: +{item.up_votes || 0} / -{item.down_votes || 0}</small>
              {item.admin_note && <small>Admin note: {item.admin_note}</small>}
            </div>
            <div className="admin-user-actions">
              <select
                value={item.status || "new"}
                onChange={event => updateSuggestion(item, { status: event.target.value })}
              >
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="rejected">Rejected</option>
              </select>
              <button
                type="button"
                className="secondary-button small"
                onClick={() => {
                  const note = prompt("Admin note", item.admin_note || "");
                  if (note !== null) updateSuggestion(item, { admin_note: note });
                }}
              >
                Note
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
