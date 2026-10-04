// The last few CSV imports, each with a details view and an Undo.
export function ImportHistory({ batches: latestImportBatches, accounts, onViewDetails, onUndo }) {
  return (
    <section className="card import-history-card">
      <div className="section-header compact-header">
        <div>
          <h3>Recent import history</h3>
        </div>
      </div>

      {latestImportBatches.length === 0 ? (
        <p className="muted">No CSV imports yet.</p>
      ) : (
        <div className="archive-list">
          {latestImportBatches.map(batch => {
            const account = accounts.find(item => item.id === batch.accountId);
            return (
              <div key={batch.id} className="archive-row import-history-row">
                <div>
                  <strong>{batch.fileName}</strong>
                  <small>{account?.name || "Unknown account"} · {new Date(batch.importedAt).toLocaleString("en-GB")}</small>
                </div>
                <div className="archive-row-actions import-history-actions">
                  <span className="pill">{batch.importedRows} new</span>
                  <span className="pill transfer">{batch.linkedRows} linked</span>
                  <span className="pill expense">{batch.skippedRows} skipped</span>
                  <small>{batch.reconciliationStatus}</small>
                  <button className="secondary-button small" onClick={() => onViewDetails(batch.id)}>View details</button>
                  <button className="secondary-button small" onClick={() => onUndo(batch.id)}>Undo import</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
