const navItems = [
  ["dashboard", "Dashboard"],
  ["transactions", "Transactions"],
  ["budgets", "Budgets"],
  ["bills", "Bills"],
  ["savings", "Savings"],
  ["accounts", "Accounts"],
  ["reports", "Reports"],
  ["settings", "Settings"]
];

export default function TopNav({ activePage, setActivePage }) {
  return (
    <nav className="top-nav">
      {navItems.map(([key, label]) => (
        <button
          key={key}
          className={`nav-item ${activePage === key ? "active" : ""}`}
          onClick={() => setActivePage(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
