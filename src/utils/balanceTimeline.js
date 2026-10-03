// Day-by-day account balances for the Accounts page chart, over a chosen range.
import { formatIsoDateLocal, todayIsoDate } from "./dates.js";

function isoDate(date) {
  return formatIsoDateLocal(date);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function addYears(date, amount) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + amount);
  return next;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function endOfYear(date) {
  return new Date(date.getFullYear(), 11, 31);
}

function validIsoDate(value) {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : datePart;
}

function getEarliestAccountDate(data, accounts) {
  const dates = [];

  (data.transactions || []).forEach(transaction => {
    if (transaction.date) dates.push(transaction.date);
  });

  (data.accountAdjustments || []).forEach(adjustment => {
    if (adjustment.date) dates.push(adjustment.date);
  });

  accounts.forEach(account => {
    const createdDate = validIsoDate(account.createdAt || account.updatedAt);
    if (createdDate) dates.push(createdDate);
  });

  const validDates = dates
    .map(validIsoDate)
    .filter(Boolean)
    .sort();

  return validDates[0] || todayIsoDate();
}

function formatBalanceTick(dateString, range) {
  const date = new Date(`${dateString}T00:00:00`);
  if (range === "days") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (range === "weeks") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (range === "years") {
    return date.toLocaleDateString("en-GB", { year: "numeric" });
  }
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export function buildBalanceTimeline(data, accounts, range) {
  const today = new Date(`${todayIsoDate()}T00:00:00`);
  const earliest = new Date(`${getEarliestAccountDate(data, accounts)}T00:00:00`);
  const points = [];

  if (range === "days") {
    for (let i = 29; i >= 0; i -= 1) {
      points.push(addDays(today, -i));
    }
  } else if (range === "weeks") {
    for (let i = 11; i >= 0; i -= 1) {
      points.push(addDays(today, -(i * 7)));
    }
  } else if (range === "months") {
    for (let i = 11; i >= 0; i -= 1) {
      const point = addMonths(today, -i);
      points.push(i === 0 ? today : endOfMonth(point));
    }
  } else if (range === "years") {
    for (let i = 4; i >= 0; i -= 1) {
      const point = addYears(today, -i);
      points.push(i === 0 ? today : endOfYear(point));
    }
  } else {
    const diffDays = Math.max(1, Math.ceil((today - earliest) / (1000 * 60 * 60 * 24)));
    if (diffDays > 730) {
      const startYear = earliest.getFullYear();
      const endYear = today.getFullYear();
      for (let year = startYear; year <= endYear; year += 1) {
        points.push(year === endYear ? today : new Date(year, 11, 31));
      }
    } else {
      const start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      let cursor = start;
      while (cursor <= today) {
        const point = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()
          ? today
          : endOfMonth(cursor);
        points.push(point);
        cursor = addMonths(cursor, 1);
      }
    }
  }

  const uniqueDates = [...new Set(points.map(isoDate))].sort();
  return buildBalanceRowsFromDeltas(data, accounts, uniqueDates, range);
}

function buildBalanceRowsFromDeltas(data, accounts, dateStrings, range) {
  const deltasByAccount = new Map(accounts.map(account => [account.id, []]));

  (data.accountAdjustments || []).forEach(adjustment => {
    const date = validIsoDate(adjustment.date);
    if (!date || !deltasByAccount.has(adjustment.accountId)) return;
    deltasByAccount.get(adjustment.accountId).push({ date, amount: Number(adjustment.amount || 0) });
  });

  (data.transactions || []).forEach(transaction => {
    const date = validIsoDate(transaction.date);
    const amount = Number(transaction.amount || 0);
    if (!date || !Number.isFinite(amount)) return;

    if (transaction.type === "income" && deltasByAccount.has(transaction.accountId)) {
      deltasByAccount.get(transaction.accountId).push({ date, amount });
    } else if (transaction.type === "expense" && deltasByAccount.has(transaction.accountId)) {
      deltasByAccount.get(transaction.accountId).push({ date, amount: -amount });
    }
  });

  const balancesByAccount = new Map();
  accounts.forEach(account => {
    const deltas = (deltasByAccount.get(account.id) || []).sort((a, b) => a.date.localeCompare(b.date));
    let pointer = 0;
    let runningBalance = Number(account.openingBalance || 0);
    const values = new Map();

    dateStrings.forEach(dateString => {
      while (pointer < deltas.length && deltas[pointer].date <= dateString) {
        runningBalance += deltas[pointer].amount;
        pointer += 1;
      }
      values.set(dateString, runningBalance);
    });

    balancesByAccount.set(account.id, values);
  });

  return dateStrings.map(dateString => {
    const row = {
      date: dateString,
      label: formatBalanceTick(dateString, range)
    };

    accounts.forEach(account => {
      row[account.id] = balancesByAccount.get(account.id)?.get(dateString) ?? Number(account.openingBalance || 0);
    });

    return row;
  });
}
