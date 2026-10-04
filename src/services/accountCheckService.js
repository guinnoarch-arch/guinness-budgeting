import { calculateAccountBalanceAtDate } from "../utils/calculations.js";
import { MS_PER_DAY, addDaysToIsoDate } from "../utils/dates.js";
import { formatSignedAmount, roundMoney } from "../utils/money.js";

// A day-by-day health check of one account, independent of any import: every
// transaction/adjustment per day, the app's end-of-day balance next to the
// bank's (as recorded by past CSV imports), and flags for
//  - possible duplicates (same amount and direction a day or less apart,
//    e.g. imported twice from overlapping statements, or entered by hand and
//    then imported), and
//  - transfer gaps (a transfer whose other side is missing, deleted, or
//    doesn't agree), with any likely other side found in the other account.
// Pure: returns data for AccountCheckModal to render.
export function buildAccountCheck(data, accountId, { fromDate, toDate }) {
  const accounts = data.accounts || [];
  const accountNames = new Map(accounts.map(account => [account.id, account.name]));
  const batchesById = new Map((data.importBatches || []).map(batch => [batch.id, batch]));
  const allTransactions = data.transactions || [];
  const transactionsById = new Map(allTransactions.map(transaction => [transaction.id, transaction]));

  const inRange = date => Boolean(date) && date >= fromDate && date <= toDate;
  const accountTransactions = allTransactions.filter(transaction => (
    transaction.accountId === accountId
    && (transaction.type === "income" || transaction.type === "expense")
    && inRange(transaction.date)
  ));
  const adjustments = (data.accountAdjustments || []).filter(adjustment => adjustment.accountId === accountId && inRange(adjustment.date));

  const flagsById = new Map();
  const addFlag = (id, flag) => {
    if (!flagsById.has(id)) flagsById.set(id, []);
    flagsById.get(id).push(flag);
  };

  // --- Possible duplicates -------------------------------------------------
  const byAmount = new Map();
  accountTransactions.forEach(transaction => {
    const key = `${transaction.type}|${roundMoney(transaction.amount)}`;
    if (!byAmount.has(key)) byAmount.set(key, []);
    byAmount.get(key).push(transaction);
  });
  const duplicatePairs = [];
  byAmount.forEach(group => {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        if (daysBetween(a.date, b.date) > 1) continue;
        const verdict = judgeDuplicatePair(a, b);
        if (verdict) duplicatePairs.push({ a, b, ...verdict });
      }
    }
  });
  duplicatePairs.forEach(({ a, b, level, reason }) => {
    [[a, b], [b, a]].forEach(([self, other]) => addFlag(self.id, {
      kind: "duplicate",
      level,
      text: `${level === "likely" ? "Likely duplicate" : "Possible duplicate"} of "${other.title || "Transaction"}" on ${other.date} — ${reason}.`,
      otherId: other.id
    }));
  });

  // --- Transfer gaps -------------------------------------------------------
  const linkedIds = new Set(allTransactions.filter(transaction => transaction.transferLinkId).map(transaction => transaction.id));
  accountTransactions.forEach(transaction => {
    const signed = signedAmount(transaction);
    if (transaction.transferLinkId) {
      const partner = transactionsById.get(transaction.transferLinkId);
      if (!partner) {
        addFlag(transaction.id, { kind: "transfer", level: "likely", text: "Transfer whose other side has been deleted — the other account is missing this money movement." });
        return;
      }
      const partnerName = accountNames.get(partner.accountId) || "another account";
      const problems = [];
      if (partner.accountId === accountId) problems.push("its other side is in this same account");
      if (Math.abs(signedAmount(partner) + signed) > 0.005) problems.push(`the other side in ${partnerName} is ${formatSignedAmount(signedAmount(partner))}, not ${formatSignedAmount(-signed)}`);
      if (partner.transferLinkId !== transaction.id) problems.push("the other side doesn't link back to this one");
      if (daysBetween(partner.date, transaction.date) > 3) problems.push(`the other side is dated ${partner.date}`);
      if (problems.length) {
        addFlag(transaction.id, { kind: "transfer", level: "likely", text: `Transfer ${signed < 0 ? "to" : "from"} ${partnerName}, but ${problems.join("; ")}.` });
      } else {
        addFlag(transaction.id, { kind: "transfer_ok", level: "info", text: `Transfer ${signed < 0 ? "to" : "from"} ${partnerName} (${partner.date}), matched` });
      }
      return;
    }

    const isOneSided = transaction.status === "one_side_imported" || Boolean(transaction.linkedAccountId);
    if (!isOneSided) return;
    const expectedAccountId = transaction.linkedAccountId || null;
    const candidates = allTransactions
      .filter(other => (
        other.id !== transaction.id
        && other.accountId !== accountId
        && (!expectedAccountId || other.accountId === expectedAccountId)
        && (other.type === "income" || other.type === "expense")
        && !linkedIds.has(other.id)
        && Math.abs(signedAmount(other) + signed) <= 0.005
        && daysBetween(other.date, transaction.date) <= 3
      ))
      .sort((x, y) => daysBetween(x.date, transaction.date) - daysBetween(y.date, transaction.date))
      .slice(0, 3)
      .map(other => ({ id: other.id, title: other.title || "Transaction", date: other.date, accountName: accountNames.get(other.accountId) || "Another account" }));
    const where = expectedAccountId ? accountNames.get(expectedAccountId) || "the other account" : "another account";
    addFlag(transaction.id, {
      kind: "transfer",
      level: candidates.length ? "possible" : "likely",
      text: candidates.length
        ? `Transfer ${signed < 0 ? "to" : "from"} ${where} that isn't linked yet — ${candidates.length === 1 ? "this looks like" : "these could be"} the other side:`
        : `Transfer ${signed < 0 ? "to" : "from"} ${where}, but the other side isn't in ${where} — it may not have been imported yet (e.g. still pending on that statement).`,
      candidates
    });
  });

  // --- Day by day --------------------------------------------------------
  const bankBalances = getBankEndOfDayBalances(data, accountId, batchesById);
  const dates = new Set([
    ...accountTransactions.map(transaction => transaction.date),
    ...adjustments.map(adjustment => adjustment.date),
    ...[...bankBalances.keys()].filter(inRange)
  ]);
  const sortedDates = [...dates].sort();

  let running = calculateAccountBalanceAtDate(data, accountId, addDaysToIsoDate(fromDate, -1));
  let previousGap = null;
  const days = sortedDates.map(date => {
    const dayTransactions = accountTransactions.filter(transaction => transaction.date === date);
    const dayAdjustments = adjustments.filter(adjustment => adjustment.date === date);
    running = roundMoney(running
      + dayTransactions.reduce((total, transaction) => total + signedAmount(transaction), 0)
      + dayAdjustments.reduce((total, adjustment) => total + Number(adjustment.amount || 0), 0));

    const bank = bankBalances.get(date) || null;
    const gap = bank ? roundMoney(running - bank.balance) : null;
    const gapChange = gap === null ? null : roundMoney(gap - (previousGap ?? 0));
    if (gap !== null) previousGap = gap;

    const items = [
      ...dayTransactions.map(transaction => ({
        id: transaction.id,
        kind: "transaction",
        title: transaction.title || "Transaction",
        signedAmount: signedAmount(transaction),
        source: describeSource(transaction, batchesById),
        flags: flagsById.get(transaction.id) || []
      })),
      ...dayAdjustments.map(adjustment => ({
        id: adjustment.id,
        kind: "adjustment",
        title: "Balance adjustment",
        signedAmount: Number(adjustment.amount || 0),
        source: adjustment.note || (adjustment.importBatchId ? "Added by a CSV import" : "Added by reconcile"),
        flags: []
      }))
    ];

    return {
      date,
      appBalance: running,
      bankBalance: bank?.balance ?? null,
      bankSource: bank?.fileName || null,
      gap,
      gapChange,
      items,
      hasDuplicate: items.some(item => item.flags.some(flag => flag.kind === "duplicate")),
      hasTransferGap: items.some(item => item.flags.some(flag => flag.kind === "transfer")),
      isOut: gap !== null && Math.abs(gap) >= 0.005,
      gapMoves: gapChange !== null && Math.abs(gapChange) >= 0.005
    };
  });

  return {
    days,
    summary: {
      duplicates: duplicatePairs.length,
      transferGaps: [...flagsById.values()].flat().filter(flag => flag.kind === "transfer").length,
      daysOut: days.filter(day => day.isOut).length,
      gapMoves: days.filter(day => day.gapMoves).length,
      daysWithBankBalance: days.filter(day => day.bankBalance !== null).length
    }
  };
}

// Two same-amount, same-direction transactions a day or less apart. Distinct
// rows of the *same* statement are real separate payments (the bank listed
// both), so those are never flagged.
function judgeDuplicatePair(a, b) {
  const aRows = a.matchedBankRows || [];
  const bRows = b.matchedBankRows || [];
  const aBatches = new Set(aRows.map(row => row.importBatchId).filter(Boolean));
  const sameStatement = bRows.some(row => aBatches.has(row.importBatchId));
  if (sameStatement) return null;

  const aHashes = new Set(aRows.map(row => row.sourceRowHash).filter(Boolean));
  const sameBankRow = bRows.some(row => aHashes.has(row.sourceRowHash));
  const text = textsMatch(`${a.title || ""}`, `${b.title || ""}`);
  const aFromBank = aRows.length > 0;
  const bFromBank = bRows.length > 0;

  if (aFromBank && bFromBank) {
    if (sameBankRow) return { level: "likely", reason: "the same bank row was imported twice (overlapping statements)" };
    if (text) return { level: "likely", reason: "same wording and amount from two different imports" };
    if (a.date === b.date) return { level: "possible", reason: "same amount on the same day from two different imports" };
    return null;
  }
  if (aFromBank !== bFromBank) {
    if (text || a.date === b.date) return { level: "possible", reason: "one was entered by hand and the other imported from the bank" };
    return null;
  }
  if (a.date === b.date && text) return { level: "possible", reason: "both entered by hand with the same wording" };
  return null;
}

// The bank's own end-of-day balance for each day past imports covered. The
// newest import wins where they overlap. Imports that stored daily balances
// are used as-is; older ones are reconstructed from the balance saved on each
// imported bank row: the day's closing row is the one whose balance isn't
// the starting point (balance − amount) of another row that day.
function getBankEndOfDayBalances(data, accountId, batchesById) {
  const result = new Map();
  const batches = [...batchesById.values()]
    .filter(batch => batch.accountId === accountId)
    .sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")));
  const batchRank = new Map(batches.map((batch, index) => [batch.id, index]));

  const rowsByBatchDay = new Map();
  (data.transactions || []).forEach(transaction => {
    (transaction.matchedBankRows || []).forEach(row => {
      if (row?.accountId !== accountId || row.balance === null || row.balance === undefined || !row.date) return;
      if (!batchRank.has(row.importBatchId)) return;
      const key = `${row.importBatchId}|${row.date}`;
      if (!rowsByBatchDay.has(key)) rowsByBatchDay.set(key, []);
      rowsByBatchDay.get(key).push(row);
    });
  });

  batches.forEach(batch => {
    const fileName = batch.fileName || "CSV import";
    if (Array.isArray(batch.csvDailyBalances) && batch.csvDailyBalances.length) {
      batch.csvDailyBalances.forEach(day => {
        if (!result.has(day.date)) result.set(day.date, { balance: Number(day.balance), fileName });
      });
      return;
    }
    rowsByBatchDay.forEach((rows, key) => {
      const [batchId, date] = key.split("|");
      if (batchId !== batch.id || result.has(date)) return;
      const starts = new Set(rows.map(row => roundMoney(Number(row.balance) - Number(row.amount || 0))));
      const closing = rows.filter(row => !starts.has(roundMoney(row.balance)));
      if (closing.length === 1) result.set(date, { balance: Number(closing[0].balance), fileName });
    });
  });

  return result;
}

function describeSource(transaction, batchesById) {
  const bankRow = (transaction.matchedBankRows || [])[0];
  if (bankRow) {
    const batch = batchesById.get(bankRow.importBatchId);
    return batch ? `Imported from "${batch.fileName || "CSV"}"` : "Imported from a bank CSV";
  }
  if (transaction.status === "planned" || transaction.recurringItemId || transaction.isRecurring) return "Planned / recurring, not from the bank";
  return "Entered by hand";
}

function textsMatch(a, b) {
  const textA = normaliseText(a);
  const textB = normaliseText(b);
  if (!textA || !textB) return false;
  return textA === textB || textA.includes(textB.slice(0, 14)) || textB.includes(textA.slice(0, 14));
}

function normaliseText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function signedAmount(transaction) {
  return transaction.type === "income" ? Number(transaction.amount || 0) : -Number(transaction.amount || 0);
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 999;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / MS_PER_DAY));
}

