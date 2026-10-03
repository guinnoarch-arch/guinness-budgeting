// Full-page screens shown instead of the app: while loading, and when an
// admin has blocked or paused the account or turned on maintenance mode.

export function LoadingScreen({ phoneMode, title, message }) {
  return (
    <main className={`loading-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card loading-card">
        <p className="eyebrow">GH Budgeting</p>
        <h1>{title}</h1>
        <p className="muted-text">{message}</p>
      </section>
    </main>
  );
}

export function BlockedAccountScreen({ phoneMode, onLogout }) {
  return (
    <main className={`blocked-account-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card blocked-account-card">
        <p className="eyebrow">Account blocked</p>
        <h1>Your account has been blocked. Contact the app admin.</h1>
        <p className="muted-text">
          Blocking is access control only. This app has not deleted local browser data, backups, or budget records.
        </p>
        <button type="button" className="primary-button" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}

export function PausedAccountScreen({ phoneMode, onLogout }) {
  return (
    <main className={`blocked-account-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card blocked-account-card">
        <p className="eyebrow">Account paused</p>
        <h1>Your account access has been paused by the app admin.</h1>
        <p className="muted-text">
          This is temporary, not a block - contact the admin to resume. Local browser data, backups, and budget records have not been touched.
        </p>
        <button type="button" className="primary-button" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}

export function MaintenanceScreen({ phoneMode, message, onLogout }) {
  return (
    <main className={`blocked-account-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card blocked-account-card">
        <p className="eyebrow">Under maintenance</p>
        <h1>The app is temporarily unavailable while the admin makes changes.</h1>
        <p className="muted-text">
          {message || "This shouldn't take long. Your local data is safe either way."}
        </p>
        <button type="button" className="secondary-button" onClick={onLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}
