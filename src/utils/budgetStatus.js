import { formatMoney } from "./money.js";

const DEFAULT_THRESHOLDS = { greenMax: 75, orangeMax: 100 };

// How a category budget is doing, in words as well as a colour tone, so the
// state never relies on colour alone.
export function describeBudgetStatus(item, thresholds = DEFAULT_THRESHOLDS) {
  if (!item.limit) {
    return { tone: "", label: "No budget set", remainingText: "No budget set" };
  }
  const remainingText = item.remaining >= 0
    ? `${formatMoney(item.remaining)} left`
    : `${formatMoney(Math.abs(item.remaining))} over`;
  if (item.usedPercent > thresholds.orangeMax) return { tone: "red", label: "Over budget", remainingText };
  if (item.usedPercent >= thresholds.greenMax) return { tone: "orange", label: "Nearly used", remainingText };
  return { tone: "green", label: "On track", remainingText };
}
