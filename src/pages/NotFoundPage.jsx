export default function NotFoundPage({ actions }) {
  return (
    <div className="page-grid">
      <section className="card empty-state-card">
        <p className="eyebrow">Page not found</p>
        <h1 className="page-title">There's no page at this address</h1>
        <p className="muted">
          The link may be mistyped or out of date. Your budget data hasn't been affected.
        </p>
        <button type="button" className="primary-button" onClick={() => actions.setActivePage("dashboard")}>
          Go to dashboard
        </button>
      </section>
    </div>
  );
}
