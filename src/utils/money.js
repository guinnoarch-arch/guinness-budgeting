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
