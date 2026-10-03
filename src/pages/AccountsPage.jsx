import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { calculateAccountBalance, transactionMatchesAccount } from "../utils/calculations.js";
import { formatMoney, roundMoney } from "../utils/money.js";
import { createId } from "../utils/ids.js";
import AccountCheckModal from "../components/accounts/AccountCheckModal.jsx";
import { deleteAccountPermanently, getAccountDeleteBlocker, isAccountArchived, setAccountArchived } from "../services/accountService.js";
import { todayIsoDate } from "../utils/dates.js";
import ExpandableChart from "../components/common/ExpandableChart.jsx";
import { checkMoneyAmount, collectErrors, validateAccountForm } from "../utils/validation.js";
import useFormErrors from "../hooks/useFormErrors.js";
import { ErrorSummary, FieldError, FormError, RequiredMark } from "../components/common/FormFeedback.jsx";
import { BalanceChartTooltip } from "../components/accounts/BalanceChartTooltip.jsx";
import { buildBalanceTimeline } from "../utils/balanceTimeline.js";

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

const ACCOUNT_LINE_COLOURS = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#65a30d",
  "#db2777"
];

const BALANCE_RANGE_OPTIONS = [
  { value: "days", label: "Last 30 days", shortLabel: "Days" },
  { value: "weeks", label: "Last 12 weeks", shortLabel: "Weeks" },
  { value: "months", label: "Last 12 months", shortLabel: "Months" },
  { value: "years", label: "Last 5 years", shortLabel: "Years" },
  { value: "all", label: "All time", shortLabel: "All" }
];

function formatAccountType(type) {
  const labels = {
    current: "Current account",
    savings: "Savings account",
    cash: "Cash",
    investment: "Investment account",
    other: "Other account"
  };

  return labels[type] || type;
}

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

      <section className="card account-balance-chart-card">
        <div className="section-header compact-header account-balance-chart-header">
          <div>
            <h3>Account balances over time</h3>
          </div>
          <div className="account-chart-controls">
            <label className="compact-field account-range-select">
              Range
              <select value={balanceRange} onChange={event => setBalanceRange(event.target.value)}>
                {BALANCE_RANGE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="account-picker">
              <button
                type="button"
                className="secondary-button account-picker-button"
                onClick={() => setAccountPickerOpen(prev => !prev)}
              >
                {selectedAccountLabel}
              </button>
              {accountPickerOpen && (
                <div className="account-picker-menu">
                  <div className="account-picker-actions">
                    <button type="button" className="text-button" onClick={selectAllChartAccounts}>All accounts</button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setAccountPickerOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                  {accounts.map(account => (
                    <label key={account.id} className="account-picker-option">
                      <input
                        type="checkbox"
                        checked={visibleChartAccountIds.includes(account.id)}
                        onChange={() => toggleChartAccount(account.id)}
                      />
                      <span>{account.name}</span>
                      <button
                        type="button"
                        className="text-button mini-text-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          selectOnlyChartAccount(account.id);
                        }}
                      >
                        Only
                      </button>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedChartAccounts.length === 0 ? (
          <p className="muted-text">Select at least one account to show the balance chart.</p>
        ) : (
          <ExpandableChart title={"Account balances over time"} height={320}>
            <LineChart data={balanceChartData} margin={{ top: 12, right: 22, left: 8, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={16}
                tick={{ fill: "#4b5563", fontSize: 12 }}
              />
              <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} tickFormatter={(value) => formatMoney(value, false)} />
              <Tooltip content={<BalanceChartTooltip />} />
              {selectedChartAccounts.map((account, index) => (
                <Line
                  key={account.id}
                  type="monotone"
                  dataKey={account.id}
                  name={account.name}
                  stroke={ACCOUNT_LINE_COLOURS[index % ACCOUNT_LINE_COLOURS.length]}
                  strokeWidth={2.5}
                  dot={balanceChartData.length <= 12}
                  connectNulls
                />
              ))}
            </LineChart>
          </ExpandableChart>
        )}
      </section>

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
              <span>{txn.date} · {txn.title}</span>
              <strong>{formatMoney(txn.amount)}</strong>
            </div>
          ))
        )}
      </section>

      <section className="card archived-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived accounts</h3>
          </div>
        </div>
        {archivedAccounts.length === 0 ? (
          <p className="muted">No archived accounts. Archive an account from Edit account when you close it, and it'll move here.</p>
        ) : (
          <div className="archive-list">
            {archivedAccounts.map(account => {
              const deleteBlocker = getAccountDeleteBlocker(appData, account);
              return (
                <div key={account.id} className="archive-row">
                  <div>
                    <strong>{account.name}</strong>
                    <small>{formatAccountType(account.type)} · balance {formatMoney(calculateAccountBalance(appData, account.id))}</small>
                    {deleteBlocker && <small>{deleteBlocker}</small>}
                  </div>
                  <div className="row-actions archive-row-actions">
                    <button type="button" className="secondary-button" onClick={() => restoreAccount(account)}>Restore</button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => deleteAccount(account)}
                      disabled={Boolean(deleteBlocker)}
                      title={deleteBlocker || undefined}
                    >
                      Delete permanently
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {accountModalOpen && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={saveAccount} noValidate>
            <div className="section-header">
              <h2>{editingAccount ? "Edit account" : "Add account"}</h2>
              <button type="button" className="icon-button" onClick={closeAccountModal} aria-label="Close">×</button>
            </div>

            <ErrorSummary errors={accountErrors.errors} getFieldId={accountErrors.getFieldId} />

            <div className="form-grid">
              <label>
                <span>Account name<RequiredMark /></span>
                <input
                  {...accountErrors.fieldProps("name")}
                  aria-required="true"
                  placeholder="Monzo, NatWest, Cash, Savings"
                  value={accountForm.name}
                  onChange={event => updateAccountForm("name", event.target.value)}
                />
                <FieldError fieldId={accountErrors.getFieldId("name")} message={accountErrors.errors.name} />
              </label>

              <label>
                Account type
                <select
                  value={accountForm.type}
                  onChange={event => updateAccountForm("type", event.target.value)}
                >
                  <option value="current">Current account</option>
                  <option value="savings">Savings account</option>
                  <option value="investment">Investment account</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other account</option>
                </select>
              </label>

              <label>
                Opening balance
                <input
                  {...accountErrors.fieldProps("openingBalance")}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  value={accountForm.openingBalance}
                  onChange={event => updateAccountForm("openingBalance", event.target.value)}
                  onBlur={() => accountErrors.validateFieldOnBlur("openingBalance", accountForm)}
                />
                <FieldError fieldId={accountErrors.getFieldId("openingBalance")} message={accountErrors.errors.openingBalance} />
              </label>
            </div>

            <FormError message={accountModalError} />

            <div className="modal-actions split-modal-actions">
              <div>
                {editingAccount && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      if (archiveAccount(editingAccount)) closeAccountModal();
                    }}
                  >
                    Archive account
                  </button>
                )}
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={closeAccountModal}>Cancel</button>
                <button className="primary-button">{editingAccount ? "Save account" : "Add account"}</button>
              </div>
            </div>
          </form>
        </div>
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
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={e => { e.preventDefault(); saveReconcile(); }} noValidate>
            <div className="section-header">
              <h2>Reconcile {reconciling.name}</h2>
              <button type="button" className="icon-button" onClick={closeReconcile} aria-label="Close">×</button>
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
                <span>Actual balance<RequiredMark /></span>
                <input
                  {...reconcileErrors.fieldProps("actualBalance")}
                  aria-required="true"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  value={reconcileAmount}
                  onChange={e => setReconcileAmount(e.target.value)}
                  onBlur={() => reconcileErrors.validateFieldOnBlur("actualBalance", { actualBalance: reconcileAmount })}
                />
                <FieldError fieldId={reconcileErrors.getFieldId("actualBalance")} message={reconcileErrors.errors.actualBalance} />
              </label>
            </div>

            <p className="muted">
              {(() => {
                const entered = parseFloat(reconcileAmount);
                if (!Number.isFinite(entered)) return "Enter the balance shown by your bank.";
                const difference = roundMoney(entered - calculateAccountBalance(appData, reconciling.id));
                if (difference === 0) return "No adjustment needed — the balances already match.";
                return `This will add an adjustment of ${difference > 0 ? "+" : "−"}${formatMoney(Math.abs(difference))}.`;
              })()}
            </p>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeReconcile}>Cancel</button>
              <button className="primary-button">Reconcile</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
