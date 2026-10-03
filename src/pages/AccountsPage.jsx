import { useEffect, useMemo, useState } from "react";
import { calculateAccountBalance, transactionMatchesAccount } from "../utils/calculations.js";
import { formatMoney, roundMoney } from "../utils/money.js";
import { createId } from "../utils/ids.js";
import AccountCheckModal from "../components/accounts/AccountCheckModal.jsx";
import { deleteAccountPermanently, getAccountDeleteBlocker, isAccountArchived, setAccountArchived } from "../services/accountService.js";
import { formatDisplayDate, todayIsoDate } from "../utils/dates.js";
import { checkMoneyAmount, collectErrors, validateAccountForm } from "../utils/validation.js";
import useFormErrors from "../hooks/useFormErrors.js";
import { buildBalanceTimeline } from "../utils/balanceTimeline.js";
import { AccountBalanceChartCard } from "../components/accounts/AccountBalanceChartCard.jsx";
import { ArchivedAccountsCard } from "../components/accounts/ArchivedAccountsCard.jsx";
import { AccountFormModal } from "../components/accounts/AccountFormModal.jsx";
import { ReconcileModal } from "../components/accounts/ReconcileModal.jsx";
import { formatAccountType } from "../components/accounts/accountDisplay.js";

function validateReconcileForm(values) {
  return collectErrors({
    actualBalance: checkMoneyAmount(values.actualBalance, { allowZero: true, allowNegative: true, example: "1250.40" })
  });
}

const emptyAccountForm = {
  name: "",
  type: "current",
  openingBalance: "0"
};

export default function AccountsPage({ appData, actions }) {
  const [reconciling, setReconciling] = useState(null);
  const [checkingAccountId, setCheckingAccountId] = useState(null);
  const [reconcileAmount, setReconcileAmount] = useState("");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [accountModalError, setAccountModalError] = useState("");
  const accountErrors = useFormErrors("account", validateAccountForm);
  const reconcileErrors = useFormErrors("reconcile", validateReconcileForm);
  const [balanceRange, setBalanceRange] = useState("months");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [selectedChartAccountIds, setSelectedChartAccountIds] = useState(() => (
    (appData.accounts || [])
      .filter(account => account.isActive !== false)
      .map(account => account.id)
  ));

  const accounts = useMemo(() => (appData.accounts || []).filter(account => account.isActive !== false), [appData.accounts]);
  const archivedAccounts = (appData.accounts || []).filter(isAccountArchived);
  const visibleChartAccountIds = selectedChartAccountIds.filter(id => accounts.some(account => account.id === id));
  const selectedChartAccounts = accounts.filter(account => visibleChartAccountIds.includes(account.id));
  const accountBalances = accounts.map(account => ({
    account,
    balance: calculateAccountBalance(appData, account.id)
  }));
  const total = accountBalances.reduce((sum, item) => sum + item.balance, 0);
  const spendableTotal = accountBalances
    .filter(item => ["current", "cash"].includes(item.account.type))
    .reduce((sum, item) => sum + item.balance, 0);
  const savingsTotal = accountBalances
    .filter(item => item.account.type === "savings")
    .reduce((sum, item) => sum + item.balance, 0);
  const cashTotal = accountBalances
    .filter(item => item.account.type === "cash")
    .reduce((sum, item) => sum + item.balance, 0);
  const investmentTotal = accountBalances
    .filter(item => item.account.type === "investment")
    .reduce((sum, item) => sum + item.balance, 0);
  const otherTotal = accountBalances
    .filter(item => !["current", "savings", "cash", "investment"].includes(item.account.type))
    .reduce((sum, item) => sum + item.balance, 0);
  const recentActivity = useMemo(() => (
    [...appData.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
  ), [appData.transactions]);
  const balanceChartData = useMemo(() => (
    buildBalanceTimeline(appData, accounts, balanceRange)
  ), [appData, accounts, balanceRange]);

  useEffect(() => {
    accountErrors.clearFixedErrors(accountForm);
    // Only re-check when the form values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountForm]);

  useEffect(() => {
    reconcileErrors.clearFixedErrors({ actualBalance: reconcileAmount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconcileAmount]);

  const selectedAccountLabel = visibleChartAccountIds.length === accounts.length
    ? "All active accounts"
    : `${visibleChartAccountIds.length} selected`;

  function handleReconcile(account) {
    const currentBalance = calculateAccountBalance(appData, account.id);
    setReconciling(account);
    setReconcileAmount(currentBalance.toFixed(2));
  }

  function saveReconcile() {
    if (!reconciling) return;
    if (!reconcileErrors.validateAll({ actualBalance: reconcileAmount })) return;
    const targetBalance = roundMoney(parseFloat(reconcileAmount));
    const currentBalance = calculateAccountBalance(appData, reconciling.id);
    const difference = roundMoney(targetBalance - currentBalance);

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

    closeReconcile();
  }

  function closeReconcile() {
    setReconciling(null);
    setReconcileAmount("");
    reconcileErrors.resetErrors();
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
    setAccountModalError("");
    accountErrors.resetErrors();
  }

  function saveAccount(event) {
    event.preventDefault();

    if (!accountErrors.validateAll(accountForm)) return;
    const name = accountForm.name.trim();
    const openingBalance = roundMoney(parseFloat(accountForm.openingBalance || "0"));

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
      setSelectedChartAccountIds(prev => [...prev, newAccount.id]);
    }

    closeAccountModal();
  }

  function archiveAccount(account) {
    if (accounts.length <= 1) {
      setAccountModalError("This is your only active account, so it can't be archived. Add another account first, then archive this one.");
      return false;
    }
    const balance = calculateAccountBalance(appData, account.id);
    const balanceNote = balance !== 0
      ? ` It still has a balance of ${formatMoney(balance)}, which won't be included in the account totals while it's archived.`
      : "";
    if (!window.confirm(`Archive ${account.name}? Its transactions stay in your history, and you can restore it at any time.${balanceNote}`)) return false;
    actions.updateAppData(setAccountArchived(appData, account.id, true), { reason: "Account archived" });
    return true;
  }

  function restoreAccount(account) {
    actions.updateAppData(setAccountArchived(appData, account.id, false), { reason: "Account restored" });
    setSelectedChartAccountIds(prev => (prev.includes(account.id) ? prev : [...prev, account.id]));
  }

  function deleteAccount(account) {
    if (getAccountDeleteBlocker(appData, account)) return;
    if (!window.confirm(`Permanently delete ${account.name}? This can't be undone. Budgets, rules and savings-goal links that only pointed at this account will be removed.`)) return;
    actions.updateAppData(deleteAccountPermanently(appData, account.id), { reason: "Archived account permanently deleted" });
  }

  function toggleChartAccount(accountId) {
    setSelectedChartAccountIds(prev => {
      if (prev.includes(accountId)) {
        const next = prev.filter(id => id !== accountId);
        return next.length > 0 ? next : prev;
      }
      return [...prev, accountId];
    });
  }

  function selectAllChartAccounts() {
    setSelectedChartAccountIds(accounts.map(account => account.id));
  }

  function selectOnlyChartAccount(accountId) {
    setSelectedChartAccountIds([accountId]);
    setAccountPickerOpen(false);
  }

  return (
    <div className="page-grid accounts-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>Balances and activity</h2>
        </div>
        <button className="primary-button" onClick={openAddAccount}>+ Add account</button>
      </div>

      <section className="card all-accounts-summary-card">
        <div className="section-header compact-header">
          <div>
            <h3>All accounts summary</h3>
          </div>
          <span className="pill">{accounts.length} active account{accounts.length === 1 ? "" : "s"}</span>
        </div>

        <div className="accounts-total-grid">
          <div className="accounts-total-card main-total">
            <span>Total balance</span>
            <strong>{formatMoney(total)}</strong>
            <small>Current + savings + investments + cash + other</small>
          </div>
          <div className="accounts-total-card">
            <span>Spendable</span>
            <strong>{formatMoney(spendableTotal)}</strong>
            <small>Current accounts + cash</small>
          </div>
          <div className="accounts-total-card">
            <span>Savings</span>
            <strong>{formatMoney(savingsTotal)}</strong>
            <small>Savings accounts only</small>
          </div>
          <div className="accounts-total-card">
            <span>Investments</span>
            <strong>{formatMoney(investmentTotal)}</strong>
            <small>Contributed so far, not current value</small>
          </div>
          <div className="accounts-total-card">
            <span>Cash</span>
            <strong>{formatMoney(cashTotal)}</strong>
            <small>Cash accounts only</small>
          </div>
          <div className="accounts-total-card">
            <span>Other</span>
            <strong>{formatMoney(otherTotal)}</strong>
            <small>Other account types</small>
          </div>
        </div>
      </section>

      <AccountBalanceChartCard
        accountPickerOpen={accountPickerOpen}
        accounts={accounts}
        balanceChartData={balanceChartData}
        balanceRange={balanceRange}
        selectAllChartAccounts={selectAllChartAccounts}
        selectOnlyChartAccount={selectOnlyChartAccount}
        selectedAccountLabel={selectedAccountLabel}
        selectedChartAccounts={selectedChartAccounts}
        setAccountPickerOpen={setAccountPickerOpen}
        setBalanceRange={setBalanceRange}
        toggleChartAccount={toggleChartAccount}
        visibleChartAccountIds={visibleChartAccountIds}
      />

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
                <button
                  className="secondary-button small"
                  onClick={() => setCheckingAccountId(account.id)}
                >
                  Check account
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="card">
        <h3>Recent account activity</h3>
        {recentActivity.length === 0 ? (
          <p className="muted">No account activity yet.</p>
        ) : (
          recentActivity.map(txn => (
            <div key={txn.id} className="simple-row">
              <span>{formatDisplayDate(txn.date)} · {txn.title}</span>
              <strong>{formatMoney(txn.amount)}</strong>
            </div>
          ))
        )}
      </section>

      <ArchivedAccountsCard
        appData={appData}
        archivedAccounts={archivedAccounts}
        deleteAccount={deleteAccount}
        restoreAccount={restoreAccount}
      />

      {accountModalOpen && (
        <AccountFormModal
          accountErrors={accountErrors}
          accountForm={accountForm}
          accountModalError={accountModalError}
          archiveAccount={archiveAccount}
          closeAccountModal={closeAccountModal}
          editingAccount={editingAccount}
          saveAccount={saveAccount}
          updateAccountForm={updateAccountForm}
        />
      )}

      {checkingAccountId && accounts.some(account => account.id === checkingAccountId) && (
        <AccountCheckModal
          account={accounts.find(account => account.id === checkingAccountId)}
          appData={appData}
          actions={actions}
          close={() => setCheckingAccountId(null)}
        />
      )}

      {reconciling && (
        <ReconcileModal
          appData={appData}
          closeReconcile={closeReconcile}
          reconcileAmount={reconcileAmount}
          reconcileErrors={reconcileErrors}
          reconciling={reconciling}
          saveReconcile={saveReconcile}
          setReconcileAmount={setReconcileAmount}
        />
      )}
    </div>
  );
}
