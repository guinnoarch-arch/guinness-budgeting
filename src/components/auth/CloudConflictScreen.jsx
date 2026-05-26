import { useMemo, useState } from "react";
import { buildMergeReview } from "../../services/cloudMergeService.js";

function formatDateTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CountLine({ label, localValue, cloudValue }) {
  return (
    <p>
      <span>{label}</span>
      <strong>{localValue ?? 0} local / {cloudValue ?? 0} cloud</strong>
    </p>
  );
}

function TransactionMiniCard({ title, transaction }) {
  return (
    <div className="backup-count-card">
      <span>{title}</span>
      <strong>{transaction?.title || transaction?.description || "Untitled transaction"}</strong>
      <small>{transaction?.date || "No date"} / {transaction?.type || "type?"} / GBP {Number(transaction?.amount || 0).toFixed(2)}</small>
      <small>{transaction?.accountId || "No account"} / {transaction?.categoryId || "No category"}</small>
      {transaction?.notes && <small>{transaction.notes}</small>}
    </div>
  );
}

export default function CloudConflictScreen({
  appData,
  conflict,
  onKeepLocal,
  onUseCloud,
  onKeepBoth,
  onApplyMerge,
  onDownloadLocal
}) {
  const [mode, setMode] = useState("summary");
  const [confirmText, setConfirmText] = useState("");
  const mergeReview = useMemo(() => (
    conflict?.cloudData ? buildMergeReview(appData, conflict.cloudData) : null
  ), [appData, conflict?.cloudData]);

  const localCounts = conflict?.localFingerprint?.counts || {};
  const cloudCounts = conflict?.cloudFingerprint?.counts || conflict?.counts || {};

  return (
    <main className="login-gate-page">
      <section className="card login-gate-card">
        <div className="login-gate-brand">
          <div className="brand-icon large"><img src="/icons/gb-icon-192.png" alt="" /></div>
          <div>
            <p className="eyebrow">Cloud/local data review</p>
            <h1>Choose which budget data to use</h1>
            <p className="muted-text">The app found a difference between this browser's local data and the latest Supabase cloud backup. Nothing will be overwritten unless you confirm it.</p>
          </div>
        </div>

        <div className="storage-health-grid cloud-status-grid">
          <p><span>Local updated</span><strong>{formatDateTime(conflict?.localFingerprint?.updatedAt)}</strong></p>
          <p><span>Cloud backup</span><strong>{formatDateTime(conflict?.cloudFingerprint?.updatedAt || conflict?.createdAt)}</strong></p>
          <p><span>Local checksum</span><strong>{conflict?.localFingerprint?.checksum || "Unknown"}</strong></p>
          <p><span>Cloud checksum</span><strong>{conflict?.cloudFingerprint?.checksum || "Unknown"}</strong></p>
          <CountLine label="Transactions" localValue={localCounts.transactions} cloudValue={cloudCounts.transactions} />
          <CountLine label="Accounts" localValue={localCounts.accounts} cloudValue={cloudCounts.accounts} />
          <CountLine label="Categories" localValue={localCounts.categories} cloudValue={cloudCounts.categories} />
          <CountLine label="Savings goals" localValue={localCounts.savingsGoals} cloudValue={cloudCounts.savingsGoals} />
        </div>

        <div className="row-actions cloud-action-row">
          <button type="button" className="secondary-button" onClick={onKeepLocal}>Keep local data</button>
          <button type="button" className="secondary-button" onClick={() => setMode("use-cloud")}>Use cloud backup</button>
          <button type="button" className="secondary-button" onClick={onKeepBoth}>Keep both separately</button>
          <button type="button" className="primary-button" onClick={() => setMode("merge")}>Review and merge</button>
        </div>

        {mode === "use-cloud" && (
          <div className="restore-preview-box cloud-restore-preview-box">
            <h3>Use cloud backup</h3>
            <p className="muted-text">This will replace local data only after confirmation. A local JSON backup will be downloaded first if the browser allows it.</p>
            <label className="restore-confirm-label">
              Type USE CLOUD to replace local data
              <input value={confirmText} onChange={event => setConfirmText(event.target.value)} placeholder="USE CLOUD" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setMode("summary"); setConfirmText(""); }}>Cancel</button>
              <button className="danger-button" disabled={confirmText !== "USE CLOUD"} onClick={onUseCloud}>Replace local data with cloud backup</button>
            </div>
          </div>
        )}

        {mode === "merge" && mergeReview && (
          <div className="restore-preview-box cloud-restore-preview-box">
            <h3>Review and merge</h3>
            <p className="muted-text">This preview keeps records by stable ID and flags uncertain transaction duplicates. Financial records are not averaged or silently combined.</p>

            <div className="backup-status-grid">
              <div className="backup-status-item"><span>Kept from local</span><strong>{mergeReview.totals.keptLocal}</strong></div>
              <div className="backup-status-item"><span>Kept from cloud</span><strong>{mergeReview.totals.keptCloud}</strong></div>
              <div className="backup-status-item"><span>Same ID unchanged</span><strong>{mergeReview.totals.merged}</strong></div>
              <div className="backup-status-item"><span>Possible duplicates</span><strong>{mergeReview.possibleDuplicateTransactions.length}</strong></div>
            </div>

            {mergeReview.possibleDuplicateTransactions.length > 0 && (
              <div className="storage-log-list">
                {mergeReview.possibleDuplicateTransactions.slice(0, 8).map(item => (
                  <div className="storage-log-row warning" key={item.id}>
                    <strong>Possible duplicate transaction</strong>
                    <span>Matched because: {item.reasons.join(", ")}</span>
                    <div className="backup-count-grid">
                      <TransactionMiniCard title="Local transaction" transaction={item.localTransaction} />
                      <TransactionMiniCard title="Cloud transaction" transaction={item.cloudTransaction} />
                    </div>
                    <span>Default for this patch: keep both unless you manually clean them up after reviewing.</span>
                  </div>
                ))}
              </div>
            )}

            <div className="backup-warning-box">
              <strong>Merge summary before saving</strong>
              <span>Local-only and cloud-only records will be kept. Same-ID conflicts with timestamps use the newer record. Same-ID conflicts without a clear timestamp keep local and are listed as review risk.</span>
            </div>

            <label className="restore-confirm-label">
              Type APPLY MERGE to save the reviewed merged data locally
              <input value={confirmText} onChange={event => setConfirmText(event.target.value)} placeholder="APPLY MERGE" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={onDownloadLocal}>Download local backup first</button>
              <button className="secondary-button" onClick={() => { setMode("summary"); setConfirmText(""); }}>Cancel</button>
              <button className="primary-button" disabled={confirmText !== "APPLY MERGE"} onClick={() => onApplyMerge(mergeReview)}>Save merged data locally</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
