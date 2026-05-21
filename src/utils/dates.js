export function padDatePart(value) {
  return String(value).padStart(2, "0");
}

export function formatIsoDateLocal(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return todayIsoDate();
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}-${padDatePart(d.getDate())}`;
}

export function parseIsoDateLocal(value) {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addDaysToIsoDate(dateString, days) {
  const date = parseIsoDateLocal(dateString) || new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return formatIsoDateLocal(date);
}

export function addMonthsToIsoDate(dateString, months) {
  const date = parseIsoDateLocal(dateString) || new Date();
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months || 0));
  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return formatIsoDateLocal(date);
}

export function addYearsToIsoDate(dateString, years) {
  return addMonthsToIsoDate(dateString, Number(years || 0) * 12);
}

export function getMonthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${padDatePart(d.getMonth() + 1)}`;
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
  return formatIsoDateLocal(new Date());
}

export function daysElapsedInMonth(monthKey) {
  const now = new Date();
  const currentMonth = getMonthKey(now);
  const [year, month] = monthKey.split("-").map(Number);
  if (monthKey === currentMonth) return now.getDate();
  return new Date(year, month, 0).getDate();
}
