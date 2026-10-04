// Labels and messages shown while reviewing a CSV import.

export function formatDate(value) {
  if (!value) return "—";
  return value;
}

export function getActionOptions(row) {
  const base = [
    ["new", "Create new transaction"],
    ["match_planned", "Link to planned/manual transaction"],
    ["new_transfer", "Create transfer"],
    ["match_existing_transfer", "Link to existing transfer"],
    ["duplicate", "Skip as duplicate"]
  ];

  const hasMatch = Boolean(row.matchTransactionId);

  return base.filter(([value]) => {
    if (value === "match_planned" && (!hasMatch || row.type === "transfer")) return false;
    if (value === "match_existing_transfer" && (!hasMatch || row.type !== "transfer")) return false;
    return true;
  });
}

export function describeRowStatus(status) {
  if (status === "unticked") return "unticked, so not being imported";
  if (status === "duplicate") return "marked as a duplicate of something already saved";
  if (status === "overlap_duplicate") return "skipped as it's on the newer statement";
  return "being imported";
}

// "12 added · 4 matched as transfers · 3 skipped as duplicates" — only the
// parts that actually happened.
export function describeImportOutcome(counts, unreadableCount) {
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = [
    `${plural(counts.added, "transaction")} added`,
    counts.transferMatches ? `${counts.transferMatches} matched as the other side of a transfer` : "",
    counts.existingMatches ? `${counts.existingMatches} matched to existing transactions` : "",
    counts.duplicates ? `${counts.duplicates} skipped as duplicates` : "",
    counts.notSelected ? `${counts.notSelected} unticked and skipped` : "",
    counts.missingTransferAccount ? `${plural(counts.missingTransferAccount, "transfer")} skipped (no other account chosen)` : "",
    unreadableCount ? `${unreadableCount} unreadable row${unreadableCount === 1 ? "" : "s"} left out` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildUndoMessage(batch) {
  const created = Number(batch.importedRows || batch.transactionIds?.length || 0);
  const linked = Number(batch.linkedRows || batch.linkedTransactionIds?.length || 0);
  const skipped = Number(batch.skippedRows || 0);
  const adjustment = batch.reconciliationAdjustmentIds?.length || (batch.reconciliationAdjustmentId ? 1 : 0);

  return [
    `Undo import "${batch.fileName}"?`,
    "",
    "This will remove:",
    `- ${created} imported transaction/transfer row(s)`,
    `- ${adjustment} reconciliation adjustment(s)`,
    "",
    "This will not delete planned transactions that were only matched.",
    `It will unlink ${linked} matched row(s) and keep ${skipped} skipped row(s) skipped.`,
    ...(batch.replacedData ? [
      "",
      `This import replaced a period, so it will also put back ${(batch.replacedData.removedTransactions || []).length + (batch.replacedData.changedTransactions || []).length} transaction(s) and ${(batch.replacedData.removedAdjustments || []).length} adjustment(s) it removed or changed.`
    ] : [])
  ].join("\n");
}

// Green/amber/red mirror csvImportService's three confidence tiers so the
// color always means the same thing: green is the highest confirmation
// (exact wording or corroborated timestamps), amber matched on the same
// day, red matched only within the 2-day pairing window and most needs a
// second look before importing.
export function getConfidenceColor(confidence) {
  if (confidence === "High") return "var(--green)";
  if (confidence === "Medium") return "var(--orange)";
  return "var(--red)";
}

export function getTransferText(row, edit, selectedAccountId, accounts) {
  const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
  if (!linkedAccountId) return "Choose the other account or add a new one.";

  const uploadedAccountId = row.sourceAccountId || selectedAccountId;
  const uploadedAccount = accounts.find(account => account.id === uploadedAccountId)?.name || "Selected account";
  const linkedAccount = accounts.find(account => account.id === linkedAccountId)?.name || "Other account";
  return row.signedAmount > 0
    ? `${uploadedAccount} FROM ${linkedAccount}`
    : `${uploadedAccount} TO ${linkedAccount}`;
}
