import { useMemo, useState } from "react";
import { calculateAccountBalance, transactionMatchesAccount } from "../utils/calculations.js";
import { formatMoney } from "../utils/money.js";
import { createId } from "../utils/ids.js";
import { todayIsoDate } from "../utils/dates.js";

const emptyAccountForm = {
  name: "",
  type: "current",
  openingBalance: "0"
};

function formatAccountType(type) {
  const labels = {
    current: "Current account",
    savings: "Savings account",
    cash: "Cash",
    other: "Other account"
  };

  return labels[type] || type;
}

export default function AccountsPage({ appData, actions }) {
  const [reconciling, setReconciling] = useState(null);
  const [reconcileAmount, setReconcileAmount] = useState("");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);

  const accounts = appData.accounts.filter(account => account.isActive);
  const total = accounts.reduce((sum, account) => sum + calculateAccountBalance(appData, account.id), 0);
  const recentActivity = useMemo(() => (
    [...appData.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
  ), [appData.transactions]);

  function handleReconcile(account) {
    const currentBalance = calculateAccountBalance(appData, account.id);
    setReconciling(account);
    setReconcileAmount(currentBalance.toString());
  }

  function saveReconcile() {
    if (!reconciling) return;
    const targetBalance = parseFloat(reconcileAmount);
    const currentBalance = calculateAccountBalance(appData, reconciling.id);
    const difference = targetBalance - currentBalance;

    if (!Number.isFinite(targetBalance)) return alert("Enter a valid balance.");

    if (difference !== 0) {
      const adjustment = {
        id: createId("adj"),
        accountId: reconciling.id,
        date: todayIsoDate(),
        amount: difference,
        note: `Reconciled from ${formatMoney(currentBalance)} to ${formatMoney(targetBalance)}`,
        createdAt: new Date().toISOString()
      };

      actions.updateAppData({
        ...appData,
        accountAdjustments: [adjustment, ...(appData.accountAdjustments || [])]
      });
    }

    setReconciling(null);
    setReconcileAmount("");
  }

  function openAddAccount() {
    setEditingAccount(null);
    setAccountForm(emptyAccountForm);
    setAccountModalOpen(true);
  }

  function openEditAccount(account) {
    setEditingAccount(account);
    setAccountForm({
      name: account.name || "",
      type: account.type || "current",
      openingBalance: String(account.openingBalance ?? 0)
    });
    setAccountModalOpen(true);
  }

  function updateAccountForm(field, value) {
    setAccountForm(prev => ({ ...prev, [field]: value }));
  }

  function closeAccountModal() {
    setEditingAccount(null);
    setAccountForm(emptyAccountForm);
    setAccountModalOpen(false);
  }

  function saveAccount(event) {
    event.preventDefault();

    const name = accountForm.name.trim();
    const openingBalance = parseFloat(accountForm.openingBalance || "0");

    if (!name) return alert("Enter an account name.");
    if (!Number.isFinite(openingBalance)) return alert("Enter a valid opening balance.");

    if (editingAccount) {
      actions.updateAppData({
        ...appData,
        accounts: appData.accounts.map(account => (
          account.id === editingAccount.id
            ? {
                ...account,
                name,
                type: accountForm.type,
                openingBalance,
                updatedAt: new Date().toISOString()
              }
            : account
        ))
      });
    } else {
      const newAccount = {
        id: createId("acc"),
        name,
        type: accountForm.type,
        openingBalance,
        isDefault: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      actions.updateAppData({
        ...appData,
        accounts: [...appData.accounts, newAccount]
      });
    }

    closeAccountModal();
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Balances and activity</h2>
        </div>
        <button className="primary-button" onClick={openAddAccount}>+ Add account</button>
      </div>

      <div className="summary-grid">
        {accounts.map(account => {
          const balance = calculateAccountBalance(appData, account.id);
          const activityCount = appData.transactions.filter(transaction => transactionMatchesAccount(transaction, account.id)).length;

          return (
            <section key={account.id} className="card summary-card account-card">
              <p className="eyebrow">{formatAccountType(account.type)}</p>
              <h3>{account.name}</h3>
              <strong>{formatMoney(balance)}</strong>
              <small>{activityCount} linked transaction{activityCount === 1 ? "" : "s"}</small>
              <div className="account-card-actions">
                <button
                  className="secondary-button small"
                  onClick={() => handleReconcile(account)}
                >
                  Reconcile balance
                </button>
                <button
                  className="secondary-button small"
                  onClick={() => openEditAccount(account)}
                >
                  Edit account
                </button>
              </div>
            </section>
          );
        })}
        <section className="card summary-card">
          <p className="eyebrow">Total</p>
          <h3>{formatMoney(total)}</h3>
          <span className="muted">Across active accounts</span>
        </section>
      </div>

      <section className="card">
        <h3>Recent account activity</h3>
        {recentActivity.length === 0 ? (
          <p className="muted">No account activity yet.</p>
        ) : (
          recentActivity.map(txn => (
            <div key={txn.id} className="simple-row">
              <span>{txn.date} · {txn.title}</span>
              <strong>{formatMoney(txn.amount)}</strong>
            </div>
          ))
        )}
      </section>

      {accountModalOpen && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={saveAccount}>
            <div className="section-header">
              <h2>{editingAccount ? "Edit account" : "Add account"}</h2>
              <button type="button" className="icon-button" onClick={closeAccountModal}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Account name
                <input
                  placeholder="Monzo, NatWest, Cash, Savings"
                  value={accountForm.name}
                  onChange={event => updateAccountForm("name", event.target.value)}
                />
              </label>

              <label>
                Account type
                <select
                  value={accountForm.type}
                  onChange={event => updateAccountForm("type", event.target.value)}
                >
                  <option value="current">Current account</option>
                  <option value="savings">Savings account</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other account</option>
                </select>
              </label>

              <label>
                Opening balance
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={accountForm.openingBalance}
                  onChange={event => updateAccountForm("openingBalance", event.target.value)}
                />
              </label>
            </div>

            <p className="muted-text">
              Opening balance is the starting amount for this account before transactions and reconciliation adjustments.
            </p>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeAccountModal}>Cancel</button>
              <button className="primary-button">{editingAccount ? "Save account" : "Add account"}</button>
            </div>
          </form>
        </div>
      )}

      {reconciling && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={e => { e.preventDefault(); saveReconcile(); }}>
            <div className="section-header">
              <h2>Reconcile {reconciling.name}</h2>
              <button type="button" className="icon-button" onClick={() => setReconciling(null)}>×</button>
            </div>

            <div className="form-grid">
              <label>
                Current balance
                <input
                  type="text"
                  disabled
                  value={formatMoney(calculateAccountBalance(appData, reconciling.id))}
                />
              </label>

              <label>
                Actual balance
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={reconcileAmount}
                  onChange={e => setReconcileAmount(e.target.value)}
                />
              </label>
            </div>

            <p className="muted">
              {reconcileAmount && reconcileAmount !== calculateAccountBalance(appData, reconciling.id).toString()
                ? `This will create an adjustment of ${formatMoney(Math.abs(parseFloat(reconcileAmount) - calculateAccountBalance(appData, reconciling.id)))}`
                : "No adjustment needed"}
            </p>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setReconciling(null)}>Cancel</button>
              <button className="primary-button">Reconcile</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
