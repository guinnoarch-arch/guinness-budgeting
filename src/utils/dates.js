export function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getPreviousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month - 2, 1));
}

export function getNextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month, 1));
}

export function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric"
  });
}

export function isInMonth(dateString, monthKey) {
  return dateString?.startsWith(monthKey);
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function daysElapsedInMonth(monthKey) {
  const now = new Date();
  const currentMonth = getMonthKey(now);
  const [year, month] = monthKey.split("-").map(Number);
  if (monthKey === currentMonth) return now.getDate();
  return new Date(year, month, 0).getDate();
}
