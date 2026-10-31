import { useMemo, useState } from "react";
import { ArrowLeft, Folder, FolderPlus } from "lucide-react";
import TransactionTable from "./TransactionTable.jsx";
import { formatMoney } from "../../utils/money.js";
import {
  cleanFolderName,
  createFolder,
  deleteFolder,
  findFolderByName,
  getSavedFolders,
  removeTransactionFromFolder,
  renameFolder
} from "../../services/savedFolderService.js";

function summariseFolder(folder, transactionsById) {
  const transactions = (folder.transactionIds || []).map(id => transactionsById.get(id)).filter(Boolean);
  const real = transactions.filter(txn => !txn.transferLinkId);
  return {
    transactions,
    count: transactions.length,
    spent: real.filter(txn => txn.type === "expense").reduce((sum, txn) => sum + Number(txn.amount || 0), 0),
    received: real.filter(txn => txn.type === "income").reduce((sum, txn) => sum + Number(txn.amount || 0), 0)
  };
}

// The "Saved transactions" tab: a list of folders, and inside a folder the
// transactions filed in it, shown the same way as on the main Transactions tab.
export default function SavedTransactionsView({ appData, actions, openFolderId, onOpenFolder, onAddTransactions }) {
  const folders = getSavedFolders(appData);
  const transactionsById = useMemo(
    () => new Map((appData.transactions || []).map(txn => [txn.id, txn])),
    [appData.transactions]
  );
  const openFolder = openFolderId ? folders.find(folder => folder.id === openFolderId) : null;

  if (openFolder) {
    return (
      <FolderDetail
        appData={appData}
        actions={actions}
        folder={openFolder}
        summary={summariseFolder(openFolder, transactionsById)}
        onBack={() => onOpenFolder(null)}
        onAddTransactions={() => onAddTransactions(openFolder)}
      />
    );
  }

  return <FolderList appData={appData} actions={actions} folders={folders} transactionsById={transactionsById} onOpenFolder={onOpenFolder} />;
}

function FolderList({ appData, actions, folders, transactionsById, onOpenFolder }) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  function handleCreate(event) {
    event.preventDefault();
    const name = cleanFolderName(newName);
    if (!name) {
      setError("Give the folder a name, for example Holiday 2026.");
      return;
    }
    if (findFolderByName(appData, name)) {
      setError(`You already have a folder called ${name}.`);
      return;
    }
    const created = createFolder(appData, name);
    actions.updateAppData(created.data, { reason: "Saved folder created" });
    setNewName("");
    setError("");
    if (created.folder) onOpenFolder(created.folder.id);
  }

  return (
    <>
      <section className="card saved-folder-create">
        <form className="saved-folder-create-form" onSubmit={handleCreate} noValidate>
          <label>
            New folder
            <input
              type="text"
              placeholder="Holiday 2026"
              value={newName}
              maxLength={60}
              onChange={event => { setNewName(event.target.value); setError(""); }}
              aria-invalid={error ? "true" : undefined}
            />
          </label>
          <button className="primary-button"><FolderPlus size={16} aria-hidden="true" /> Create folder</button>
        </form>
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>

      {folders.length === 0 ? (
        <section className="card empty-state-card">
          <h3>No saved folders yet</h3>
          <p className="muted">Make a folder to keep transactions together, for example the expenses from a holiday. You can add transactions to a folder from here, or from a transaction's Edit form.</p>
        </section>
      ) : (
        <div className="saved-folder-grid">
          {folders.map(folder => {
            const summary = summariseFolder(folder, transactionsById);
            return (
              <button key={folder.id} type="button" className="card saved-folder-card" onClick={() => onOpenFolder(folder.id)}>
                <span className="saved-folder-icon"><Folder size={20} aria-hidden="true" /></span>
                <strong>{folder.name}</strong>
                <small>{summary.count} transaction{summary.count === 1 ? "" : "s"}</small>
                <small>
                  {summary.spent > 0 ? `Spent ${formatMoney(summary.spent)}` : "Nothing spent"}
                  {summary.received > 0 ? ` · Received ${formatMoney(summary.received)}` : ""}
                </small>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function FolderDetail({ appData, actions, folder, summary, onBack, onAddTransactions }) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(folder.name);
  const [renameError, setRenameError] = useState("");

  const sorted = useMemo(
    () => [...summary.transactions].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [summary.transactions]
  );

  function saveRename(event) {
    event.preventDefault();
    const name = cleanFolderName(nameDraft);
    if (!name) {
      setRenameError("A folder needs a name.");
      return;
    }
    const clash = findFolderByName(appData, name);
    if (clash && clash.id !== folder.id) {
      setRenameError(`You already have a folder called ${name}.`);
      return;
    }
    actions.updateAppData(renameFolder(appData, folder.id, name), { reason: "Saved folder renamed" });
    setRenaming(false);
    setRenameError("");
  }

  function handleDeleteFolder() {
    const ok = window.confirm(`Delete the folder "${folder.name}"? The ${summary.count} transaction${summary.count === 1 ? "" : "s"} in it are not deleted, they just stop being filed here.`);
    if (!ok) return;
    actions.updateAppData(deleteFolder(appData, folder.id), { reason: "Saved folder deleted" });
    onBack();
  }

  function removeFromFolder(txn) {
    actions.updateAppData(removeTransactionFromFolder(appData, folder.id, txn.id), { reason: "Transaction removed from folder" });
  }

  return (
    <>
      <section className="card saved-folder-header">
        <div className="saved-folder-title">
          <button type="button" className="text-button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> All folders</button>
          {renaming ? (
            <form className="saved-folder-rename" onSubmit={saveRename} noValidate>
              <input type="text" value={nameDraft} maxLength={60} onChange={event => { setNameDraft(event.target.value); setRenameError(""); }} aria-label="Folder name" autoFocus />
              <button className="primary-button small">Save name</button>
              <button type="button" className="secondary-button small" onClick={() => { setRenaming(false); setNameDraft(folder.name); setRenameError(""); }}>Cancel</button>
            </form>
          ) : (
            <h2>{folder.name}</h2>
          )}
          {renameError && <p className="field-error" role="alert">{renameError}</p>}
        </div>

        <div className="saved-folder-totals">
          <div><span>Transactions</span><strong>{summary.count}</strong></div>
          <div><span>Spent</span><strong>{formatMoney(summary.spent)}</strong></div>
          <div><span>Received</span><strong>{formatMoney(summary.received)}</strong></div>
        </div>

        <div className="row-actions">
          <button type="button" className="primary-button" onClick={onAddTransactions}>Add transactions</button>
          {!renaming && <button type="button" className="secondary-button" onClick={() => setRenaming(true)}>Rename</button>}
          <button type="button" className="danger-button" onClick={handleDeleteFolder}>Delete folder</button>
        </div>
      </section>

      {sorted.length === 0 ? (
        <section className="card empty-state-card">
          <h3>This folder is empty</h3>
          <p className="muted">Press Add transactions to pick the ones to keep here. You can also add a transaction from its Edit form.</p>
        </section>
      ) : (
        <TransactionTable
          appData={appData}
          actions={actions}
          transactions={sorted}
          rowActions={(txn, options = {}) => (
            <button
              type="button"
              className="text-button"
              onClick={() => { removeFromFolder(txn); options.onDone?.(); }}
            >
              Remove from folder
            </button>
          )}
        />
      )}
    </>
  );
}

