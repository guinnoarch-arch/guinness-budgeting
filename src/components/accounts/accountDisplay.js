// Labels, colours and chart ranges shared by the Accounts page pieces.
import { CHART_SERIES } from "../../utils/chartTheme.js";

export const ACCOUNT_LINE_COLOURS = CHART_SERIES;

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
