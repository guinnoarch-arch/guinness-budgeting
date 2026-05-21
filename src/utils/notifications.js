import { formatMoney } from "./money.js";

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(startDate, endDate) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end - start) / MS_PER_DAY);
}

function formatDueText(daysUntilDue) {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"} overdue`;
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue === 1) return "Due tomorrow";
  return `Due in ${daysUntilDue} days`;
}

export function buildAppNotifications(appData, options = {}) {
  const today = options.today ? parseLocalDate(options.today) : new Date();
  const dueWindowDays = Number(appData.settings?.billReminderDays ?? 7);
  const notifications = [];

  const activeBills = (appData.recurringItems || []).filter(item => (
    item.isActive !== false && !item.archivedAt && item.reminderEnabled !== false
  ));

  activeBills.forEach(item => {
    const dueDate = parseLocalDate(item.nextDueDate);
    if (!dueDate) return;

    const daysUntilDue = daysBetween(today, dueDate);
    if (daysUntilDue <= dueWindowDays) {
      notifications.push({
        id: `bill-due-${item.id}`,
        type: daysUntilDue < 0 ? "danger" : daysUntilDue <= 2 ? "warning" : "notice",
        title: item.name || "Upcoming bill",
        message: `${formatDueText(daysUntilDue)} · ${formatMoney(item.amount || 0)}`,
        date: item.nextDueDate,
        sortValue: daysUntilDue,
        actionPage: "bills"
      });
    }

    const previousAmount = Number(item.previousAmount || item.lastAmount || 0);
    const currentAmount = Number(item.amount || 0);
    if (previousAmount > 0 && currentAmount > previousAmount) {
      notifications.push({
        id: `bill-increase-${item.id}-${item.amountChangedAt || item.updatedAt || "latest"}`,
        type: "danger",
        title: `${item.name || "Bill"} increased`,
        message: `${formatMoney(previousAmount)} → ${formatMoney(currentAmount)}${item.amountChangedAt ? ` · changed ${item.amountChangedAt.slice(0, 10)}` : ""}`,
        date: item.amountChangedAt || item.updatedAt || item.nextDueDate,
        sortValue: -100 + daysUntilDue,
        actionPage: "bills"
      });
    }
  });

  return notifications.sort((a, b) => {
    if ((a.sortValue ?? 0) !== (b.sortValue ?? 0)) return (a.sortValue ?? 0) - (b.sortValue ?? 0);
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
}
