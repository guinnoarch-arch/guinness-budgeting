// Display labels and small summaries for loans and houses.
import { HOUSE_CONTRIBUTION_TYPES, HOUSE_SOURCE_TYPES } from "../../utils/houseTracking.js";

export function formatLoanToValue(percent) {
  return percent === null || percent === undefined ? "Add house value" : `${percent.toFixed(1)}%`;
}

export function formatContributionType(value) {
  return HOUSE_CONTRIBUTION_TYPES.find(([key]) => key === value)?.[1] || "Other";
}

export function formatSourceType(value) {
  return HOUSE_SOURCE_TYPES.find(([key]) => key === value)?.[1] || "External contribution";
}

export function formatEventType(type) {
  if (type === "balanceAdjustment") return "Balance update";
  if (type === "overpayment") return "Overpayment";
  if (type === "repayment") return "Repayment";
  if (type === "interestAdded" || type === "interest") return "Interest";
  return type || "Event";
}

export function getTrackedInterest(events) {
  return (events || []).reduce((total, event) => {
    if (Number(event.interestAmount || 0) > 0) return total + Math.abs(Number(event.interestAmount || 0));
    if (["interest", "interestAdded", "monthlyInterest"].includes(event.type)) return total + Math.abs(Number(event.amount || 0));
    return total;
  }, 0);
}

export function getRecentEvents(events) {
  return [...(events || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3);
}
