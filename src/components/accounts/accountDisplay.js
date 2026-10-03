// Labels, colours and chart ranges shared by the Accounts page pieces.

export const ACCOUNT_LINE_COLOURS = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#65a30d",
  "#db2777"
];

export const BALANCE_RANGE_OPTIONS = [
  { value: "days", label: "Last 30 days", shortLabel: "Days" },
  { value: "weeks", label: "Last 12 weeks", shortLabel: "Weeks" },
  { value: "months", label: "Last 12 months", shortLabel: "Months" },
  { value: "years", label: "Last 5 years", shortLabel: "Years" },
  { value: "all", label: "All time", shortLabel: "All" }
];

export function formatAccountType(type) {
  const labels = {
    current: "Current account",
    savings: "Savings account",
    cash: "Cash",
    investment: "Investment account",
    other: "Other account"
  };

  return labels[type] || type;
}
