import BudgetWarningsPanel from "./BudgetWarningsPanel.jsx";
import SavingsGoalsPanel from "./SavingsGoalsPanel.jsx";

export function FocusPanel({ appData, actions, selectedMonth, accountId, isSavingsView }) {
  return isSavingsView ? (
    <SavingsGoalsPanel
      appData={appData}
      accountId={accountId}
      onViewAll={() => actions.setActivePage("savings")}
    />
  ) : (
    <BudgetWarningsPanel
      appData={appData}
      selectedMonth={selectedMonth}
      accountId={accountId}
      onViewAll={() => actions.setActivePage("budgets")}
    />
  );
}
