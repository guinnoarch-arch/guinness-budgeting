import { Fragment } from "react";

const navItems = [
  ["dashboard", "Dashboard"],
  ["transactions", "Transactions"],
  ["budgets", "Budgets"],
  ["bills", "Bills"],
  ["savings", "Savings"],
  ["accounts", "Accounts"],
  ["loans", "Loans"]
];

export default function TopNav({
  activePage,
  setActivePage,
  accounts = [],
  selectedDashboardAccountId = "all",
  setSelectedDashboardAccountId
}) {
  const activeAccounts = (accounts || []).filter(account => account.isActive !== false);
  const selectedAccountExists = activeAccounts.some(account => account.id === selectedDashboardAccountId);
  const safeSelectedAccountId = selectedAccountExists ? selectedDashboardAccountId : "all";

  return (
    <nav className="top-nav">
      {navItems.map(([key, label]) => (
        <Fragment key={key}>
          <button
            className={`nav-item ${activePage === key ? "active" : ""}`}
            onClick={() => setActivePage(key)}
          >
            {label}
          </button>

          {key === "dashboard" && activePage === "dashboard" && (
            <select
              className="nav-account-select"
              value={safeSelectedAccountId}
              onChange={event => setSelectedDashboardAccountId?.(event.target.value)}
              aria-label="Dashboard account filter"
            >
              <option value="all">All accounts</option>
              {activeAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
