import DashboardPage from "./DashboardPage.jsx";
import TransactionsPage from "./TransactionsPage.jsx";
import BudgetsPage from "./BudgetsPage.jsx";
import BillsPage from "./BillsPage.jsx";
import SavingsPage from "./SavingsPage.jsx";
import AccountsPage from "./AccountsPage.jsx";
import LoansPage from "./LoansPage.jsx";
import ReportsPage from "./ReportsPage.jsx";
import ImportPage from "./ImportPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import ControlCentrePage from "./ControlCentrePage.jsx";
import NotFoundPage from "./NotFoundPage.jsx";

// Every screen that can be opened from the URL (?page=...).
export const pages = {
  dashboard: DashboardPage,
  transactions: TransactionsPage,
  budgets: BudgetsPage,
  bills: BillsPage,
  savings: SavingsPage,
  accounts: AccountsPage,
  loans: LoansPage,
  reports: ReportsPage,
  import: ImportPage,
  control: ControlCentrePage,
  settings: SettingsPage
};

export const NOT_FOUND_PAGE = "notFound";

export { DashboardPage, NotFoundPage };
