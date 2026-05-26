import { useMemo, useState } from "react";

function makeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

export default function WelcomeScreen({ onSetup, onExplore }) {
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
    <main className="welcome-screen">
      <div className="welcome-card welcome-card-v26">
        <div className="brand-icon large"><img src="/icons/gb-icon-192.png" alt="" /></div>
        <p className="eyebrow">Local profile setup</p>
        <h1>Guinness & Holley Budgeting</h1>
        <p>
          Create a local username before you start. This makes the app feel more official and prepares the data structure for future cloud sync.
        </p>

        <div className="welcome-profile-form">
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
        </div>

        <div className="local-login-note">
          <strong>Local profile details</strong>
          <span>This names the local budget profile after sign-in. Your working data still stores locally on this browser/device.</span>
        </div>

        <div className="welcome-actions">
          <button className="primary-button" onClick={() => onSetup(buildProfilePatch(false))} disabled={!canContinue}>Setup</button>
          <button className="secondary-button" onClick={() => onExplore(buildProfilePatch(true))} disabled={!canContinue}>Explore example app</button>
        </div>
      </div>
    </main>
  );
}
