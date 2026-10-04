import { ChevronDown } from "lucide-react";

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
  setSelectedDashboardAccountId,
  featureFlags = {},
  isAdmin = false
}) {
  const activeAccounts = (accounts || []).filter(account => account.isActive !== false);
  const selectedAccountExists = activeAccounts.some(account => account.id === selectedDashboardAccountId);
  const safeSelectedAccountId = selectedAccountExists ? selectedDashboardAccountId : "all";
  const selectedAccountName = activeAccounts.find(account => account.id === safeSelectedAccountId)?.name || "All accounts";
  const visibleNavItems = navItems.filter(([key]) => key !== "loans" || featureFlags.loans !== false);

  return (
    <nav className="top-nav" aria-label="Main">
      {isAdmin && (
        <button
          className={`nav-item nav-item-admin ${activePage === "control" ? "active" : ""}`}
          aria-current={activePage === "control" ? "page" : undefined}
          onClick={() => setActivePage("control")}
        >
          Admin
        </button>
      )}

      {visibleNavItems.map(([key, label]) => (
        // On the dashboard its tab becomes the account picker, to save space.
        key === "dashboard" && activePage === "dashboard" ? (
          <span key={key} className="nav-item active nav-account-tab" aria-current="page">
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
            {/* The select is invisible and laid over this label, so the tab is
                only as wide as the chosen account, not the longest one. */}
            <span className="nav-account-label" aria-hidden="true">{selectedAccountName}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        ) : (
          <button
            key={key}
            className={`nav-item ${activePage === key ? "active" : ""}`}
            aria-current={activePage === key ? "page" : undefined}
            onClick={() => setActivePage(key)}
          >
            {label}
          </button>
        )
      ))}
    </nav>
  );
}
