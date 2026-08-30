import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  calculateAccountBalance,
  transactionMatchesAccount
} from "../utils/calculations.js";
import { formatMoney } from "../utils/money.js";
import { createId } from "../utils/ids.js";
import { formatIsoDateLocal, todayIsoDate } from "../utils/dates.js";

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
    other: "Other account"
  };

  return labels[type] || type;
}

function isoDate(date) {
  return formatIsoDateLocal(date);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function addYears(date, amount) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + amount);
  return next;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31);
}

function validIsoDate(value) {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : datePart;
}

function getEarliestAccountDate(data, accounts) {
  const dates = [];

  (data.transactions || []).forEach(transaction => {
    if (transaction.date) dates.push(transaction.date);
  });

  (data.accountAdjustments || []).forEach(adjustment => {
    if (adjustment.date) dates.push(adjustment.date);
  });

  accounts.forEach(account => {
    const createdDate = validIsoDate(account.createdAt || account.updatedAt);
    if (createdDate) dates.push(createdDate);
  });

  const validDates = dates
    .map(validIsoDate)
    .filter(Boolean)
    .sort();

  return validDates[0] || todayIsoDate();
}

function formatBalanceTick(dateString, range) {
  const date = new Date(`${dateString}T00:00:00`);
  if (range === "days") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (range === "weeks") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (range === "years") {
    return date.toLocaleDateString("en-GB", { year: "numeric" });
  }
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function buildBalanceTimeline(data, accounts, range) {
  const today = new Date(`${todayIsoDate()}T00:00:00`);
  const earliest = new Date(`${getEarliestAccountDate(data, accounts)}T00:00:00`);
  const points = [];

  if (range === "days") {
    for (let i = 29; i >= 0; i -= 1) {
      points.push(addDays(today, -i));
    }
  } else if (range === "weeks") {
    for (let i = 11; i >= 0; i -= 1) {
      points.push(addDays(today, -(i * 7)));
    }
  } else if (range === "months") {
    for (let i = 11; i >= 0; i -= 1) {
      const point = addMonths(today, -i);
      points.push(i === 0 ? today : endOfMonth(point));
    }
  } else if (range === "years") {
    for (let i = 4; i >= 0; i -= 1) {
      const point = addYears(today, -i);
      points.push(i === 0 ? today : endOfYear(point));
    }
  } else {
    const diffDays = Math.max(1, Math.ceil((today - earliest) / (1000 * 60 * 60 * 24)));
    if (diffDays > 730) {
      const startYear = earliest.getFullYear();
      const endYear = today.getFullYear();
      for (let year = startYear; year <= endYear; year += 1) {
        points.push(year === endYear ? today : new Date(year, 11, 31));
      }
    } else {
      const start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      let cursor = start;
      while (cursor <= today) {
        const point = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()
          ? today
          : endOfMonth(cursor);
        points.push(point);
        cursor = addMonths(cursor, 1);
      }
    }
  }

  const uniqueDates = [...new Set(points.map(isoDate))].sort();
  return buildBalanceRowsFromDeltas(data, accounts, uniqueDates, range);
}

function buildBalanceRowsFromDeltas(data, accounts, dateStrings, range) {
  const deltasByAccount = new Map(accounts.map(account => [account.id, []]));

  (data.accountAdjustments || []).forEach(adjustment => {
    const date = validIsoDate(adjustment.date);
    if (!date || !deltasByAccount.has(adjustment.accountId)) return;
    deltasByAccount.get(adjustment.accountId).push({ date, amount: Number(adjustment.amount || 0) });
  });

  (data.transactions || []).forEach(transaction => {
    const date = validIsoDate(transaction.date);
    const amount = Number(transaction.amount || 0);
    if (!date || !Number.isFinite(amount)) return;

    if (transaction.type === "income" && deltasByAccount.has(transaction.accountId)) {
      deltasByAccount.get(transaction.accountId).push({ date, amount });
    } else if (transaction.type === "expense" && deltasByAccount.has(transaction.accountId)) {
      deltasByAccount.get(transaction.accountId).push({ date, amount: -amount });
    }
  });

  const balancesByAccount = new Map();
  accounts.forEach(account => {
    const deltas = (deltasByAccount.get(account.id) || []).sort((a, b) => a.date.localeCompare(b.date));
    let pointer = 0;
    let runningBalance = Number(account.openingBalance || 0);
    const values = new Map();

    dateStrings.forEach(dateString => {
      while (pointer < deltas.length && deltas[pointer].date <= dateString) {
        runningBalance += deltas[pointer].amount;
        pointer += 1;
      }
      values.set(dateString, runningBalance);
    });

    balancesByAccount.set(account.id, values);
  });

  return dateStrings.map(dateString => {
    const row = {
      date: dateString,
      label: formatBalanceTick(dateString, range)
    };

    accounts.forEach(account => {
      row[account.id] = balancesByAccount.get(account.id)?.get(dateString) ?? Number(account.openingBalance || 0);
    });

    return row;
  });
}

function BalanceChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const visiblePayload = payload
    .filter(item => item.value !== null && item.value !== undefined)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  return (
    <div className="chart-tooltip-card account-balance-tooltip">
      <strong>{label}</strong>
      {visiblePayload.map(item => (
        <p key={item.dataKey}>
          <span style={{ color: item.color }}>{item.name}</span>
          <strong>{formatMoney(item.value)}</strong>
        </p>
      ))}
    </div>
  );
}

export default function AccountsPage({ appData, actions }) {
  const [reconciling, setReconciling] = useState(null);
  const [reconcileAmount, setReconcileAmount] = useState("");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [balanceRange, setBalanceRange] = useState("months");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [selectedChartAccountIds, setSelectedChartAccountIds] = useState(() => (
    (appData.accounts || [])
      .filter(account => account.isActive !== false)
      .map(account => account.id)
  ));

  const accounts = useMemo(() => (appData.accounts || []).filter(account => account.isActive !== false), [appData.accounts]);
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
  const otherTotal = accountBalances
    .filter(item => !["current", "savings", "cash"].includes(item.account.type))
    .reduce((sum, item) => sum + item.balance, 0);
  const recentActivity = useMemo(() => (
    [...appData.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
  ), [appData.transactions]);
  const balanceChartData = useMemo(() => (
    buildBalanceTimeline(appData, accounts, balanceRange)
  ), [appData, accounts, balanceRange]);

  const selectedAccountLabel = visibleChartAccountIds.length === accounts.length
    ? "All active accounts"
    : `${visibleChartAccountIds.length} selected`;

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
      setSelectedChartAccountIds(prev => [...prev, newAccount.id]);
    }

    closeAccountModal();
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
            <p className="muted-text">Top-level totals across every active account.</p>
          </div>
          <span className="pill">{accounts.length} active account{accounts.length === 1 ? "" : "s"}</span>
        </div>

        <div className="accounts-total-grid">
          <div className="accounts-total-card main-total">
            <span>Total balance</span>
            <strong>{formatMoney(total)}</strong>
            <small>Current + savings + cash + other</small>
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
            <p className="muted-text">Track account balances from opening balances, transactions, transfers, and reconciliation adjustments.</p>
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
          <ResponsiveContainer width="100%" height={320}>
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
          </ResponsiveContainer>
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
