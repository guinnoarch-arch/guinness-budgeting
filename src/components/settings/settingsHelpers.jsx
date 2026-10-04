// Small pieces shared by more than one Settings section.
import { getErrorMessage } from "../../utils/errors.js";
import { getBackupCounts } from "../../services/storageService.js";
import { addStorageLog, saveAppDataSnapshot } from "../../services/indexedDbStorageService.js";
import { formatDateTime as formatDateTimeOr } from "../../utils/dates.js";

export function formatDateTime(value) {
  return formatDateTimeOr(value, "Never");
}

export function CountGrid({ counts }) {
  const labels = [
    ["transactions", "Transactions"],
    ["accounts", "Accounts"],
    ["categories", "Categories"],
    ["budgets", "Budgets"],
    ["recurringItems", "Recurring items"],
    ["savingsGoals", "Savings goals"],
    ["closedMonths", "Closed months"],
    ["accountAdjustments", "Account adjustments"],
    ["importBatches", "CSV import batches"],
    ["importRules", "Import rules"],
    ["transferRules", "Transfer rules"],
    ["externalAccountMappings", "External account mappings"],
    ["csvColumnMappings", "Saved CSV mappings"],
    ["loans", "Loans"],
    ["loanEvents", "Loan events"],
    ["receiptAttachments", "Transactions with receipts"],
    ["profiles", "Local profiles"]
  ];

  if (Number(counts?.indexedDbReceipts || 0) > 0) {
    labels.push(["indexedDbReceipts", "Receipt files in backup"]);
  }

  return (
    <div className="backup-count-grid">
      {labels.map(([key, label]) => (
        <div key={key} className="backup-count-card">
          <strong>{counts?.[key] ?? 0}</strong>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

export function WarningList({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="backup-warning-box">
      <strong>Check before continuing</strong>
      <ul>
        {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
      </ul>
    </div>
  );
}

export async function createEmergencyRestoreSnapshot(data, reason) {
  try {
    await saveAppDataSnapshot(data, reason);
    await addStorageLog({
      level: "warning",
      event: "pre_restore_snapshot_created",
      message: "Created an emergency snapshot before replacing current app data.",
      details: {
        reason,
        createdAt: new Date().toISOString(),
        counts: getBackupCounts(data)
      }
    });
    return true;
  } catch (error) {
    await addStorageLog({
      level: "error",
      event: "pre_restore_snapshot_failed",
      message: getErrorMessage(error, "A safety copy of your current data couldn't be made, so the restore was stopped. Export a backup from Settings first, then try again."),
      details: { reason }
    });
    return false;
  }
}
