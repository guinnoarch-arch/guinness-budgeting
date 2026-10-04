// Amounts are stored as pounds in floating point, so sums can drift by a
// fraction of a penny (0.1 + 0.2 = 0.30000000000000004). Round to pence
// whenever a calculated total is shown, compared or saved.
export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function formatMoney(value, showPence = true) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: showPence ? 2 : 0,
    maximumFractionDigits: showPence ? 2 : 0
  }).format(safeValue);
}

export function signedMoney(value, type) {
  if (type === "income") return `+${formatMoney(value)}`;
  if (type === "expense") return `-${formatMoney(value)}`;
  return formatMoney(value);
}
