import { formatMoney } from "./money.js";
import { getBackupReminder } from "../services/storageService.js";
import { getBudgetWarnings } from "./calculations.js";
import { daysElapsedInMonth } from "./dates.js";

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
  const selectedMonth = options.monthKey || new Date().toISOString().slice(0, 7);
  const backupReminder = getBackupReminder(appData.settings || {});

  if (backupReminder.level === "danger" || backupReminder.level === "warning") {
    notifications.push({
      id: `backup-${backupReminder.level}-${appData.settings?.lastDataChangedAt || "latest"}`,
      type: backupReminder.level === "danger" ? "danger" : "warning",
      title: backupReminder.title,
      message: backupReminder.message,
      date: appData.settings?.lastDataChangedAt || new Date().toISOString(),
      sortValue: backupReminder.level === "danger" ? -200 : -150,
      actionPage: "settings"
    });
  }

  const monthElapsedPercent = (daysElapsedInMonth(selectedMonth) / new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()) * 100;
  getBudgetWarnings(appData, selectedMonth).slice(0, 4).forEach(item => {
    const aheadOfPace = item.usedPercent > monthElapsedPercent + 20;
    notifications.push({
      id: `budget-${item.id}-${selectedMonth}`,
      type: item.usedPercent > 100 ? "danger" : aheadOfPace ? "warning" : "notice",
      title: `${item.category?.name || "Budget"} ${item.usedPercent > 100 ? "over budget" : "budget warning"}`,
      message: `${item.usedPercent.toFixed(0)}% used${aheadOfPace ? `; ${monthElapsedPercent.toFixed(0)}% through month` : ""}`,
      date: selectedMonth,
      sortValue: item.usedPercent > 100 ? -120 : -80,
      actionPage: "budgets"
    });
  });

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
