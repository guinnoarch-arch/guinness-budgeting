import { useMemo, useState } from "react";

function makeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

export default function WelcomeScreen({ onSetup, onExplore, phoneMode = false, onTogglePhoneMode }) {
  const [displayName, setDisplayName] = useState("");
  const [profileName, setProfileName] = useState("Personal Budget");

  const cleanName = useMemo(() => makeUsername(displayName), [displayName]);
  const canContinue = cleanName.length > 0;

  function buildProfilePatch(useExampleData = false) {
    return {
      username: cleanName,
      displayName: cleanName,
      profileName: profileName.trim() || "Personal Budget",
      localOnly: true,
      syncEnabled: false,
      startedWithExampleData: useExampleData
    };
  }

  return (
    <main className={`welcome-screen ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <div className="welcome-card welcome-card-v26">
        <div className="auth-compact-toggle-row">
          <button
            type="button"
            className={`secondary-button phone-mode-toggle ${phoneMode ? "active" : ""}`}
            onClick={onTogglePhoneMode}
            aria-pressed={phoneMode}
          >
            {phoneMode ? "Desktop view" : "Phone view"}
          </button>
        </div>
        <div className="brand-icon large"><img src="/icons/gb-icon-192.png" alt="" /></div>
        <p className="eyebrow">Local profile setup</p>
        <h1>Guinness & Holley Budgeting</h1>
        <p>
          Add your name to set up this device. You can start with an empty budget, or look around with example data first.
        </p>

        <form
          className="welcome-profile-form"
          id="welcome-profile-form"
          onSubmit={event => {
            event.preventDefault();
            if (canContinue) onSetup(buildProfilePatch(false));
          }}
        >
          <label>
            Username / first name
            <input
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              placeholder="e.g. Archie"
              autoFocus
            />
          </label>
          <label>
            Budget profile name
            <input
              value={profileName}
              onChange={event => setProfileName(event.target.value)}
              placeholder="e.g. Personal Budget"
            />
          </label>
        </form>

        <div className="local-login-note">
          <strong>Local profile details</strong>
          <span>This names the local budget profile after sign-in. Your working data still stores locally on this browser/device.</span>
        </div>

        <div className="welcome-actions">
          <button type="submit" form="welcome-profile-form" className="primary-button" disabled={!canContinue}>Start my budget</button>
          <button type="button" className="secondary-button" onClick={() => onExplore(buildProfilePatch(true))} disabled={!canContinue}>Explore with example data</button>
        </div>
        {!canContinue && <p className="muted-text welcome-helper">Enter your name above to continue.</p>}
      </div>
    </main>
  );
}
