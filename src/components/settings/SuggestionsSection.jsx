import { useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/errors.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { createId } from "../../utils/ids.js";
import { listFeatureSuggestions, submitFeatureSuggestion, voteFeatureSuggestion } from "../../services/adminService.js";

export default function SuggestionsSection({ appData, actions, cloudConfigured, cloudSession, settings, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [newSuggestionText, setNewSuggestionText] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const [serverSuggestions, setServerSuggestions] = useState([]);
  const [serverSuggestionStatus, setServerSuggestionStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSuggestions() {
      if (!cloudSession?.signedIn || !cloudConfigured) return;
      try {
        const rows = await listFeatureSuggestions(settings, "all");
        if (!cancelled) setServerSuggestions(rows);
      } catch {
        if (!cancelled) setServerSuggestionStatus("Shared suggestions need the latest Supabase SQL setup.");
      }
    }
    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [cloudSession?.signedIn, cloudConfigured, settings.cloudBackup?.supabaseUrl, settings.cloudBackup?.supabaseAnonKey]);

  async function addFutureSuggestion(event) {
    event.preventDefault();
    const text = newSuggestionText.trim();
    if (!text) return;

    const now = new Date().toISOString();
    const nextSuggestion = {
      id: createId("sug"),
      text,
      status: "open",
      source: "local_user",
      createdAt: now,
      updatedAt: now
    };

    setSuggestionStatus("");
    try {
      await submitFeatureSuggestion(settings, text);
      nextSuggestion.syncedToAdmin = true;
      nextSuggestion.status = "new";
      setSuggestionStatus("Suggestion sent to the Admin Control Centre.");
    } catch (error) {
      nextSuggestion.syncedToAdmin = false;
      setSuggestionStatus(error.message?.includes("SQL setup")
        ? "Suggestion saved locally. Run the updated Supabase SQL setup before admin sync is available."
        : "Suggestion saved locally because admin sync is not available from this session.");
    }

    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        futureSuggestions: [nextSuggestion, ...(settings.futureSuggestions || [])]
      }
    }, { reason: "Future feature suggestion added" });

    setNewSuggestionText("");
  }

  function updateFutureSuggestion(id, patch) {
    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        futureSuggestions: (settings.futureSuggestions || []).map(item => (
          item.id === id ? { ...item, ...patch, updatedAt: now } : item
        ))
      }
    }, { reason: "Future feature suggestion updated" });
  }

  function deleteFutureSuggestion(id) {
    if (!confirm("Delete this suggestion?")) return;
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        futureSuggestions: (settings.futureSuggestions || []).filter(item => item.id !== id)
      }
    }, { reason: "Future feature suggestion deleted" });
  }

  async function refreshSharedSuggestions() {
    setServerSuggestionStatus("Refreshing suggestions...");
    try {
      const rows = await listFeatureSuggestions(settings, "all");
      setServerSuggestions(rows);
      setServerSuggestionStatus("Suggestions refreshed.");
    } catch (error) {
      setServerSuggestionStatus(getErrorMessage(error, "Couldn't load shared suggestions. Try again in a moment."));
    }
  }

  async function voteOnSuggestion(item, vote) {
    setServerSuggestionStatus("Saving vote...");
    try {
      await voteFeatureSuggestion(settings, item.id, vote);
      await refreshSharedSuggestions();
    } catch (error) {
      setServerSuggestionStatus(getErrorMessage(error, "Couldn't save vote. Try again in a moment."));
    }
  }

  return (
    <section className={sectionClass("future")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("future")}>
        <div>
          <h3>Future features</h3>
        </div>
        <SectionChevron sectionId="future" />
      </div>
      {activeSettingsSection === "future" && (
        <div className="future-feature-panel">
          <p className="muted">Live sync between devices and a desktop app are planned. Available now: cloud backup and restore, bank CSV import, import rules, backup and restore, reports, receipts, dark mode, dashboard layouts, profile setup, installing and offline use, and loan tracking.</p>

          <div className="suggestion-section">
            <div>
              <h4>Suggestions</h4>
            </div>

            <form className="suggestion-form" onSubmit={addFutureSuggestion}>
              <input
                type="text"
                value={newSuggestionText}
                onChange={event => setNewSuggestionText(event.target.value)}
                placeholder="e.g. Add stock watchlist dashboard"
              />
              <button className="primary-button">Add suggestion</button>
            </form>
            {suggestionStatus && <p className="cloud-status-message compact-status">{suggestionStatus}</p>}
            <div className="section-header compact-header">
              <div>
                <h4>Shared suggestions</h4>
              </div>
              <AsyncButton busyLabel="Refreshing…" type="button" className="secondary-button small" onClick={refreshSharedSuggestions}>Refresh</AsyncButton>
            </div>
            {serverSuggestionStatus && <p className="cloud-status-message compact-status">{serverSuggestionStatus}</p>}
            <div className="suggestion-list">
              {serverSuggestions.length === 0 ? <p className="muted-text">No shared suggestions loaded yet.</p> : serverSuggestions.map(item => (
                <div key={item.id} className={`suggestion-row ${item.status === "done" ? "done" : ""}`}>
                  <div>
                    <strong>{item.message}</strong>
                    <small>{item.status || "new"} - {item.submitted_username || item.submitted_email || "user"} - {item.created_at ? item.created_at.slice(0, 10) : "unknown date"}</small>
                    {item.admin_note && <small>Admin note: {item.admin_note}</small>}
                  </div>
                  <div className="row-actions">
                    <AsyncButton type="button" className="secondary-button small" onClick={() => voteOnSuggestion(item, 1)}>Up {item.up_votes || 0}</AsyncButton>
                    <AsyncButton type="button" className="secondary-button small" onClick={() => voteOnSuggestion(item, -1)}>Down {item.down_votes || 0}</AsyncButton>
                  </div>
                </div>
              ))}
            </div>

            {(settings.futureSuggestions || []).length === 0 ? (
              <p className="muted">No suggestions saved yet.</p>
            ) : (
              <div className="suggestion-list">
                {(settings.futureSuggestions || []).map(item => (
                  <div key={item.id} className={`suggestion-row ${item.status === "done" ? "done" : ""}`}>
                    <div>
                      <strong>{item.text}</strong>
                      <small>{item.status === "done" ? "Done" : "Open"} · added {item.createdAt ? item.createdAt.slice(0, 10) : "unknown date"}</small>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="secondary-button small" onClick={() => updateFutureSuggestion(item.id, { status: item.status === "done" ? "open" : "done" })}>{item.status === "done" ? "Reopen" : "Mark done"}</button>
                      <button type="button" className="danger-button small" onClick={() => deleteFutureSuggestion(item.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
