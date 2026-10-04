import { useMemo, useState } from "react";
import { analyseCsvImport, applyCsvImport, parseCsvText, suggestColumnMap, undoCsvImport, findSavedCsvColumnMapping, forgetTransferGuess, describeTextMatch, combineCsvAnalyses, applyMultiCsvImport, minutesBetween, planReplacePeriod, applyReplacePlans } from "../services/csvImportService.js";
import { createId } from "../utils/ids.js";
import { formatMoney } from "../utils/money.js";
import { BalanceChainCheckBox } from "../components/import/BalanceChainCheckBox.jsx";
import { BalanceVerificationPanel } from "../components/import/BalanceVerificationPanel.jsx";
import { ColumnSelect } from "../components/import/ColumnSelect.jsx";
import { ImportAccountModal } from "../components/import/ImportAccountModal.jsx";
import { ImportHistory } from "../components/import/ImportHistory.jsx";
import { ImportPreviewRow } from "../components/import/ImportPreviewRow.jsx";
import { UploadFileList } from "../components/import/UploadFileList.jsx";
import { DuplicateReviewModal } from "../components/import/DuplicateReviewModal.jsx";
import { ImportAnalysisSummary, SummaryItem } from "../components/import/ImportAnalysisSummary.jsx";
import { ImportBatchDetailModal } from "../components/import/ImportBatchDetailModal.jsx";
import { ReconciliationPreview } from "../components/import/ReconciliationPreview.jsx";
import { ReplacePeriodPanel } from "../components/import/ReplacePeriodPanel.jsx";
import { buildUndoMessage, describeImportOutcome } from "../components/import/importDisplay.js";
import { ADD_ACCOUNT_VALUE, emptyColumnMap, previewFilters, readTrustCsvPreference, writeTrustCsvPreference } from "../components/import/importSettings.js";
import { attachReplacedData, buildPreviewVerification, countUnreadableRows, describeMappingProblem, describeNonCsvFile, getAccountRanges, getAccountTimelines, getFilterCount, groupAdjustmentsByAccount, rowMatchesFilter, summariseCombinedAnalyses, verifyImportBalances } from "../services/importReviewService.js";
import useImportAccountModal from "../hooks/useImportAccountModal.js";
import useDuplicateReview from "../hooks/useDuplicateReview.js";

export default function ImportPage({ appData, actions }) {
  const activeAccounts = (appData.accounts || []).filter(account => account.isActive !== false);
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccounts[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState(emptyColumnMap);
  const [uploadItems, setUploadItems] = useState([]);
  const [expandedMappingId, setExpandedMappingId] = useState(null);
  const [multiRowEdits, setMultiRowEdits] = useState({});
  const [isMultiAnalysis, setIsMultiAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [rowEdits, setRowEdits] = useState({});
  const [trustCsvByDefault, setTrustCsvByDefault] = useState(readTrustCsvPreference);
  const [trustOverrides, setTrustOverrides] = useState({});
  // accountId -> { fromDate, toDate, selectedIds, selectedPartnerIds }: the
  // accounts whose statement period the CSV replaces rather than adds to.
  const [replacePlans, setReplacePlans] = useState({});
  const [replaceEditor, setReplaceEditor] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [status, setStatus] = useState("");
  const { applyImportedDuplicate, closeDuplicateReview, duplicateReviewRowId, keepExistingDuplicate, openDuplicateReview, updateExistingDuplicate } = useDuplicateReview({ actions, appData, setStatus, updateRow });
  const { accountForm, accountModal, accountValidation, closeAccountModal, openAddAccountModal, saveNewAccount, updateAccountForm } = useImportAccountModal({ actions, appData, setAnalysis, setSelectedAccountId, setStatus, updateRow });
  const [importVerification, setImportVerification] = useState(null);
  const [previewProjection, setPreviewProjection] = useState(null);
  const [detailBatchId, setDetailBatchId] = useState(null);

  const incomeCategories = useMemo(() => (appData.categories || []).filter(category => category.type === "income" && category.isActive !== false), [appData.categories]);
  const expenseCategories = useMemo(() => (appData.categories || []).filter(category => category.type === "expense" && category.isActive !== false), [appData.categories]);
  const latestImportBatches = (appData.importBatches || []).slice(0, 5);
  const effectiveRowEdits = isMultiAnalysis ? multiRowEdits : rowEdits;
  const visibleRows = analysis ? analysis.rows.filter(row => rowMatchesFilter(row, effectiveRowEdits, activeFilter)) : [];
  // What the import is analysed and applied against: the real data, minus
  // whatever the chosen "replace this period" plans clear out. Nothing is
  // saved until Confirm import.
  const importBase = useMemo(() => applyReplacePlans(appData, Object.values(replacePlans)), [appData, replacePlans]);
  const baseData = importBase.data;
  const isAccountTrusted = accountId => trustOverrides[accountId] ?? trustCsvByDefault;
  // Derived rather than stored, so flipping "Trust the CSV" updates the
  // preview straight away without re-running the whole projection.
  const previewVerification = useMemo(() => {
    if (!previewProjection || !analysis) return null;
    const verification = buildPreviewVerification(previewProjection, analysis, isAccountTrusted);
    return verification.length > 0 ? verification : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewProjection, analysis, trustOverrides, trustCsvByDefault]);

  function setAccountTrusted(accountId, trusted) {
    setTrustOverrides(prev => ({ ...prev, [accountId]: trusted }));
  }

  function updateTrustCsvByDefault(value) {
    setTrustCsvByDefault(value);
    setTrustOverrides({});
    writeTrustCsvPreference(value);
  }

  function getTrustedAccountIds() {
    return new Set((analysis?.files || []).map(fileAnalysis => fileAnalysis.accountId).filter(isAccountTrusted));
  }

  async function handleFile(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setStatus("");
    setAnalysis(null);
    setMultiRowEdits({});
    setTrustOverrides({});
    setReplacePlans({});
    setReplaceEditor(null);
    setActiveFilter("all");

    try {
      const loaded = [];
      for (const file of files) {
        const notCsvMessage = describeNonCsvFile(file);
        const text = notCsvMessage ? "" : await file.text();
        const parsed = notCsvMessage ? { headers: [], rows: [] } : parseCsvText(text);
        if (notCsvMessage || !parsed.headers.length || !parsed.rows.length) {
          loaded.push({
            id: createId("csvfile"),
            fileName: file.name,
            error: notCsvMessage || (text.trim()
              ? "No transactions were found in this file. Check it's the transaction export from your bank (with a header row such as Date, Description, Amount), not a summary or PDF saved as .csv."
              : "This file is empty. Download the statement from your bank again and choose the CSV option."),
            headers: [],
            rows: [],
            columnMap: emptyColumnMap,
            accountId: activeAccounts[0]?.id || "",
            expanded: true
          });
          continue;
        }

        const savedMapping = findSavedCsvColumnMapping(appData, parsed.headers);
        const accountId = savedMapping?.accountId && activeAccounts.some(account => account.id === savedMapping.accountId)
          ? savedMapping.accountId
          : activeAccounts[0]?.id || "";

        loaded.push({
          id: createId("csvfile"),
          fileName: file.name,
          headers: parsed.headers,
          rows: parsed.rows,
          columnMap: savedMapping?.columnMap
            ? { ...emptyColumnMap, ...savedMapping.columnMap }
            : { ...emptyColumnMap, ...suggestColumnMap(parsed.headers, parsed.rows) },
          accountId,
          ignoredTopRows: parsed.ignoredTopRows || 0,
          savedMappingName: savedMapping?.name || savedMapping?.fileName || "",
          expanded: files.length === 1
        });
      }

      setUploadItems(prev => [...prev, ...loaded]);
      setExpandedMappingId(loaded[0]?.id || null);

      // Preserve the old single-file controls for compatibility with the rest of the page.
      if (loaded.length === 1 && loaded[0].headers.length) {
        const item = loaded[0];
        setFileName(item.fileName);
        setHeaders(item.headers);
        setRows(item.rows);
        setColumnMap(item.columnMap);
        setSelectedAccountId(item.accountId);
      }

      const usable = loaded.filter(item => item.rows.length);
      const failed = loaded.length - usable.length;
      setStatus(usable.length
        ? `${usable.length} file${usable.length === 1 ? "" : "s"} ready${failed ? ` (${failed} couldn't be used — see below)` : ""}. Check the account and columns for each, then select Analyse.`
        : "None of the files could be used — see the reason under each file below.");
    } catch {
      setStatus("The file couldn't be read. Make sure it isn't open in another program, then choose it again.");
    } finally {
      event.target.value = "";
    }
  }

  function updateUploadItem(fileId, field, value) {
    setUploadItems(prev => prev.map(item => item.id === fileId ? { ...item, [field]: value } : item));
    setAnalysis(null);
    setReplacePlans({});
    setReplaceEditor(null);
  }

  function updateUploadItemMap(fileId, field, value) {
    setUploadItems(prev => prev.map(item => item.id === fileId
      ? { ...item, columnMap: { ...item.columnMap, [field]: value } }
      : item
    ));
    setAnalysis(null);
  }

  function removeUploadItem(fileId) {
    setUploadItems(prev => prev.filter(item => item.id !== fileId));
    setAnalysis(null);
    setReplacePlans({});
    setReplaceEditor(null);
    setMultiRowEdits({});
  }

  function toggleMapping(fileId) {
    setExpandedMappingId(prev => prev === fileId ? null : fileId);
  }

  function updateColumnMap(field, value) {
    setColumnMap(prev => ({ ...prev, [field]: value }));
    setAnalysis(null);
  }

  function handleStatementAccountChange(value) {
    if (value === ADD_ACCOUNT_VALUE) {
      openAddAccountModal({ mode: "statement", rowId: null, suggestedName: "" });
      return;
    }

    setSelectedAccountId(value);
    setAnalysis(null);
  }

  function handleTransferAccountChange(row, value) {
    if (value === ADD_ACCOUNT_VALUE) {
      openAddAccountModal({ mode: "transfer", rowId: row.id, suggestedName: row.externalAccountName || "" });
      return;
    }

    updateRow(row.id, "linkedAccountId", value);
    updateRow(row.id, "include", Boolean(value));
  }

  function analyseImport(baseOverride = null, plansOverride = null) {
    const base = baseOverride || baseData;
    const plans = plansOverride || replacePlans;
    const files = uploadItems.length
      ? uploadItems.filter(item => item.rows.length)
      : (rows.length ? [{
          id: "legacy_single",
          fileName,
          headers,
          rows,
          columnMap,
          accountId: selectedAccountId,
          ignoredTopRows: 0
        }] : []);

    if (!files.length) return setStatus("Choose a bank statement CSV file first.");
    for (const item of files) {
      const problem = describeMappingProblem(item);
      if (problem) {
        setExpandedMappingId(item.id);
        return setStatus(`"${item.fileName}": ${problem}`);
      }
    }

    const analyses = files.map(item => ({
      ...analyseCsvImport(base, {
        accountId: item.accountId,
        fileName: item.fileName,
        headers: item.headers,
        rows: item.rows,
        columnMap: item.columnMap,
        replacedRange: plans[item.accountId] || null
      }),
      fileId: item.id,
      accountId: item.accountId
    }));

    // Give every preview row a globally unique id, identify likely cross-file
    // transfers, and order matched pairs next to each other for review. The
    // actual import re-checks these pairs against the transactions created by
    // earlier files, so only one transfer record is created.
    const orderedRows = combineCsvAnalyses(analyses);

    const initialEdits = {};
    orderedRows.forEach(row => {
      initialEdits[row.id] = {
        include: row.defaultInclude,
        action: row.action,
        type: row.type,
        categoryId: row.categoryId || "",
        linkedAccountId: row.linkedAccountId || "",
        matchTransactionId: row.matchTransactionId || "",
        excludeFromBudget: false,
        date: row.date,
        description: row.description,
        amount: row.amount
      };
    });

    setAnalysis({
      id: createId("analysis"),
      fileName: files.length === 1 ? files[0].fileName : `${files.length} CSV files`,
      accountId: files[0].accountId,
      headers: [],
      columnMap: null,
      createdAt: new Date().toISOString(),
      rows: orderedRows,
      totals: summariseCombinedAnalyses(analyses, orderedRows),
      reconciliation: files.length === 1 ? analyses[0].reconciliation : null,
      files: analyses,
      isMulti: files.length > 1
    });
    setImportVerification(null);
    setPreviewProjection(null);
    if (files.length > 1) {
      setMultiRowEdits(initialEdits);
      setRowEdits({});
    } else {
      setRowEdits(initialEdits);
      setMultiRowEdits({});
    }
    setIsMultiAnalysis(files.length > 1);
    setTrustOverrides({});
    setActiveFilter("all");
    setStatus(`Analysed ${orderedRows.length} transaction row(s) across ${files.length} CSV file(s). Transactions are ordered by date. Review transfers and duplicates before importing.`);
  }

  function updateRow(rowId, field, value) {
    if (isMultiAnalysis) {
      setMultiRowEdits(prev => ({
        ...prev,
        [rowId]: { ...(prev[rowId] || {}), [field]: value }
      }));
      return;
    }
    setRowEdits(prev => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [field]: value }
    }));
  }

  // Same amount + opposite sign can have more than one candidate (e.g. three
  // £300 rows: one income, two possible expense matches) — the greedy pairing
  // pass only ever picks one. When the user says a specific pairing is wrong,
  // look for another still-available row before giving up on the survivor,
  // rather than assuming it must be a standalone transaction too.
  function findAlternativeCrossFileMatch(survivor, rejectedPartnerId) {
    return (analysis?.rows || []).find(candidate => (
      candidate.id !== survivor.id
      && candidate.id !== rejectedPartnerId
      && candidate.sourceAccountId !== survivor.sourceAccountId
      && Math.abs(Number(candidate.signedAmount) + Number(survivor.signedAmount)) <= 0.005
      && minutesBetween(survivor.date, survivor.time, candidate.date, candidate.time) <= 3 * 24 * 60
      // Don't poach a row that's already confidently paired with someone else.
      && (!candidate.crossFileMatchId || candidate.crossFileMatchId === rejectedPartnerId)
    )) || null;
  }

  // The user is saying this specific row is not part of a transfer. Reset it
  // to its own best guess, then give the other half of the pair a chance to
  // find a different match instead of assuming it's wrong too — only fall
  // back to making it a standalone transaction if nothing else fits.
  function rejectCrossFileMatch(row) {
    const partner = analysis?.rows.find(item => item.id === row.crossFileMatchId);

    updateRow(row.id, "action", "new");
    updateRow(row.id, "type", row.baseType);
    updateRow(row.id, "linkedAccountId", "");
    updateRow(row.id, "categoryId", row.categoryId || "");
    updateRow(row.id, "include", true);
    // row is now confirmed not part of a transfer — clear the raw pairing
    // pointer too, not just the edit, so it doesn't keep showing this button
    // (which reads row.crossFileMatchId directly, not the edit) after it's
    // already resolved.
    row.crossFileMatchId = null;

    if (!partner) {
      setStatus("Marked that row as not a transfer.");
      return;
    }

    const alternative = findAlternativeCrossFileMatch(partner, row.id);

    if (alternative) {
      partner.crossFileMatchId = alternative.id;
      alternative.crossFileMatchId = partner.id;
      const { exactText, similarity } = describeTextMatch(partner.description, alternative.description);
      const hasEvidence = exactText || similarity >= 0.25;

      [[partner, alternative], [alternative, partner]].forEach(([target, other]) => {
        updateRow(target.id, "action", "new_transfer");
        updateRow(target.id, "type", "transfer");
        updateRow(target.id, "linkedAccountId", other.sourceAccountId);
        updateRow(target.id, "include", hasEvidence);
      });

      setStatus(`"${row.description}" marked as not a transfer. Found another possible match for "${partner.description}" (${alternative.sourceFileName}) — check it before importing.`);
    } else {
      partner.crossFileMatchId = null;
      updateRow(partner.id, "action", "new");
      updateRow(partner.id, "type", partner.baseType);
      updateRow(partner.id, "linkedAccountId", "");
      updateRow(partner.id, "categoryId", partner.categoryId || "");
      updateRow(partner.id, "include", true);
      setStatus(`"${row.description}" marked as not a transfer. No other match was found for "${partner.description}", so it's now a standalone transaction — check it below.`);
    }
  }

  // A guessed transfer with no matching transaction on the other side only
  // got its linked account from a keyword or a previously learned rule — if
  // it's wrong, reset this row back to its own best guess AND forget the
  // rule/mapping that caused it, so the same wrong guess doesn't keep
  // resurfacing on every future import that mentions this payee.
  function markRowNotATransfer(row) {
    updateRow(row.id, "action", "new");
    updateRow(row.id, "type", row.baseType);
    updateRow(row.id, "categoryId", row.categoryId || "");
    updateRow(row.id, "linkedAccountId", "");
    updateRow(row.id, "include", true);

    const uploadedAccountId = row.sourceAccountId || selectedAccountId;
    const { data: nextData, removedRuleCount, removedMappingCount } = forgetTransferGuess(appData, {
      accountId: uploadedAccountId,
      description: row.description,
      externalAccountName: row.externalAccountName
    });

    if (removedRuleCount > 0 || removedMappingCount > 0) {
      actions.updateAppData(nextData, { reason: "Forgot a learned transfer rule that was matching wrongly" });
      setStatus(`"${row.description}" won't be auto-suggested as a transfer again.`);
    } else {
      setStatus(`Marked "${row.description}" as not a transfer for this import.`);
    }
  }

  // Applies a "Diagnose problem" opening-balance fix for real (this is the
  // one action in this whole preview flow that writes real data — everything
  // else stays a throwaway projection until Confirm import). The preview
  // check is now stale against the corrected account, so it's cleared and
  // the user is asked to re-run it rather than silently re-computed against
  // appData, which still holds this render's now-outdated value.
  function fixOpeningBalance(accountId, newOpeningBalance) {
    actions.updateAppData({
      ...appData,
      accounts: appData.accounts.map(account => (
        account.id === accountId
          ? { ...account, openingBalance: newOpeningBalance, updatedAt: new Date().toISOString() }
          : account
      ))
    }, { reason: "Corrected account opening balance from CSV import diagnosis" });
    setPreviewProjection(null);
    setStatus(`Opening balance updated to ${formatMoney(newOpeningBalance)}. Click "Preview projected balances" again to re-check.`);
  }

  // Runs the exact same import logic as Confirm import, against a throwaway
  // projection, so the resulting balances can be checked and troubleshot
  // *before* anything is actually saved. Nothing here is persisted — only
  // actions.updateAppData in confirmImport (and fixOpeningBalance above)
  // ever writes real data.
  // "Replace this period with the CSV": the plan is always built from the
  // real, saved data. Applying it re-runs the analysis against the cleared
  // data, which resets row edits — it's meant to be chosen before reviewing.
  function openReplaceEditor(range) {
    const plan = planReplacePeriod(appData, range.accountId, range.fromDate, range.toDate);
    const existing = replacePlans[range.accountId];
    setReplaceEditor({
      accountId: range.accountId,
      plan,
      selectedIds: new Set(existing ? existing.selectedIds : plan.items.filter(item => item.defaultSelected).map(item => item.id)),
      selectedPartnerIds: new Set(existing ? existing.selectedPartnerIds : plan.items.filter(item => item.partner?.defaultSelected).map(item => item.partner.id))
    });
  }

  function applyReplaceEditor() {
    if (!replaceEditor) return;
    const { plan } = replaceEditor;
    // A ticked "other side" only goes if its own item is going too.
    const selectedIds = [...replaceEditor.selectedIds];
    const selectedPartnerIds = plan.items
      .filter(item => item.partner && replaceEditor.selectedIds.has(item.id) && replaceEditor.selectedPartnerIds.has(item.partner.id))
      .map(item => item.partner.id);
    const nextPlans = { ...replacePlans };
    if (selectedIds.length) {
      nextPlans[plan.accountId] = { accountId: plan.accountId, fromDate: plan.fromDate, toDate: plan.toDate, selectedIds, selectedPartnerIds };
    } else {
      delete nextPlans[plan.accountId];
    }
    setReplacePlans(nextPlans);
    setReplaceEditor(null);
    analyseImport(applyReplacePlans(appData, Object.values(nextPlans)).data, nextPlans);
    setStatus(selectedIds.length
      ? `Replacing ${plan.fromDate} to ${plan.toDate}: ${selectedIds.length + selectedPartnerIds.length} item(s) will be removed and the CSV imported fresh. Nothing is saved until you confirm, and Undo import puts them back.`
      : "Nothing selected to replace, so the CSV will only add what's missing.");
  }

  function stopReplacing(accountId) {
    const nextPlans = { ...replacePlans };
    delete nextPlans[accountId];
    setReplacePlans(nextPlans);
    setReplaceEditor(null);
    analyseImport(applyReplacePlans(appData, Object.values(nextPlans)).data, nextPlans);
    setStatus("Stopped replacing — the CSV will only add what's missing for that account.");
  }

  // The projection deliberately leaves out "Trust the CSV" adjustments, so
  // the check and "Diagnose problem" show the real calculated gap; the
  // adjustments trusting would add are worked out on top of it (see
  // buildPreviewVerification).
  function previewImportResult() {
    if (!analysis) return;

    let projectedData;
    let missingTransferFileName = null;
    if (analysis.isMulti) {
      const validFileIds = new Set(uploadItems.map(item => item.id));
      ({ data: projectedData, missingTransferFileName } = applyMultiCsvImport(
        baseData, analysis.files, analysis.rows, multiRowEdits, validFileIds
      ));
    } else {
      projectedData = applyCsvImport(baseData, analysis, rowEdits, { trustCsvBalance: false }).data;
    }

    setPreviewProjection(projectedData);
    const verification = buildPreviewVerification(projectedData, analysis, isAccountTrusted);

    if (missingTransferFileName) {
      setStatus(`Preview stopped at "${missingTransferFileName}" — choose the other account for every selected transfer in that statement, then preview again.`);
      return;
    }
    const mismatched = verification.filter(item => !item.matches);
    setStatus(verification.length === 0
      ? "Preview ready, but no balance column was mapped, so projected balances can't be checked."
      : mismatched.length === 0
        ? "Preview: every account balance matches its CSV. Safe to import."
        : mismatched.every(item => isAccountTrusted(item.accountId))
          ? "Preview: the calculated balance doesn't match the CSV yet, but the CSV is trusted, so the import will make it match. Use \"Diagnose problem\" to see why first."
          : "Preview: some balances wouldn't match — see below. \"Diagnose problem\" finds the day it goes out; \"Trust the CSV\" uses the bank's figure anyway.");
  }

  function confirmImport() {
    if (!analysis) return;
    setPreviewProjection(null);
    const trustAccountIds = getTrustedAccountIds();
    const timelines = getAccountTimelines(analysis);

    if (analysis.isMulti) {
      const validFileIds = new Set(uploadItems.map(item => item.id));
      const { data: workingData, result: aggregate, missingTransferFileName } = applyMultiCsvImport(
        baseData, analysis.files, analysis.rows, multiRowEdits, validFileIds, { trustAccountIds }
      );

      if (missingTransferFileName) {
        setStatus(`Choose the other account for every selected transfer in "${missingTransferFileName}".`);
        setActiveFilter("needs_review");
        return;
      }

      const savedData = attachReplacedData(workingData, aggregate.batches, importBase.replacedByAccount);
      actions.updateAppData(savedData, { major: true, reason: "Multiple CSV imports completed", rulesTrigger: "import" });
      const verification = verifyImportBalances(workingData, timelines, groupAdjustmentsByAccount(aggregate.reconciliationAdjustments));
      setImportVerification(verification.length > 0 ? verification : null);
      const adjustmentCount = aggregate.reconciliationAdjustments.length;
      setStatus(`Import complete from ${aggregate.batches.length} statements: ${describeImportOutcome(aggregate.outcomeCounts, countUnreadableRows(analysis))}${adjustmentCount ? ` · ${adjustmentCount} balance adjustment${adjustmentCount === 1 ? "" : "s"} to match the CSV` : ""}.`);
      setAnalysis(null);
      setRows([]);
      setHeaders([]);
      setFileName("");
      setUploadItems([]);
      setMultiRowEdits({});
      setIsMultiAnalysis(false);
      setTrustOverrides({});
      setReplacePlans({});
      setReplaceEditor(null);
      setActiveFilter("all");
      return;
    }

    const missingTransfer = analysis.rows.some(row => {
      const edit = rowEdits[row.id] || {};
      const include = edit.include ?? row.defaultInclude;
      const type = edit.type || row.type;
      const action = edit.action || row.action;
      const linkedAccountId = edit.linkedAccountId || row.linkedAccountId;
      return include && type === "transfer" && action !== "match_existing_transfer" && !linkedAccountId;
    });

    if (missingTransfer) {
      setStatus("Some transfers don't say which of your accounts the money went to or came from. Choose the other account for each one under Needs review, then confirm again.");
      setActiveFilter("needs_review");
      return;
    }

    const result = applyCsvImport(baseData, analysis, rowEdits, {
      trustCsvBalance: trustAccountIds.has(analysis.accountId)
    });

    actions.updateAppData(
      attachReplacedData(result.data, [result.result.importBatch], importBase.replacedByAccount),
      { major: true, reason: "CSV import completed", rulesTrigger: "import" }
    );
    const adjustments = result.result.reconciliationAdjustments || [];
    const verification = verifyImportBalances(result.data, timelines, groupAdjustmentsByAccount(adjustments));
    setImportVerification(verification.length > 0 ? verification : null);
    setStatus(`Import complete: ${describeImportOutcome(result.result.outcomeCounts, countUnreadableRows(analysis))}${adjustments.length ? ` · ${adjustments.length} balance adjustment${adjustments.length === 1 ? "" : "s"} to match the CSV` : ""}.`);
    setAnalysis(null);
    setRows([]);
    setHeaders([]);
    setFileName("");
    setUploadItems([]);
    setRowEdits({});
    setMultiRowEdits({});
    setTrustOverrides({});
    setReplacePlans({});
    setReplaceEditor(null);
    setActiveFilter("all");
  }

  function undoImport(batchId) {
    const batch = (appData.importBatches || []).find(item => item.id === batchId);
    if (!batch) return;

    const ok = window.confirm(buildUndoMessage(batch));
    if (!ok) return;

    const result = undoCsvImport(appData, batchId);
    actions.updateAppData(result.data, { major: true, reason: "CSV import undone" });
    setStatus(`Undone import: removed ${result.result.removedTransactions} transaction(s), unlinked ${result.result.unlinkedTransactions} matched transaction(s), and removed ${result.result.removedAdjustments} adjustment(s).`);
  }

  return (
    <div className="page-grid">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Import</p>
          <h1 className="page-title">Bank CSV import</h1>
        </div>
      </div>

      <section className="card import-workflow-card">
        <div className="section-header compact-header">
          <div>
            <h3>1. Upload statement CSV</h3>
          </div>
        </div>

        <div className="form-grid import-setup-grid">
          <label>
            CSV file(s)
            <input type="file" accept=".csv,text/csv" multiple onChange={handleFile} />
          </label>
          {!uploadItems.length && (
            <label>
              Default account for a single CSV
              <select value={selectedAccountId} onChange={event => handleStatementAccountChange(event.target.value)}>
                {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                <option value={ADD_ACCOUNT_VALUE}>+ Add new account</option>
              </select>
            </label>
          )}
        </div>

        {uploadItems.length > 0 && (
          <UploadFileList
            uploadItems={uploadItems}
            activeAccounts={activeAccounts}
            expandedMappingId={expandedMappingId}
            updateUploadItem={updateUploadItem}
            updateUploadItemMap={updateUploadItemMap}
            toggleMapping={toggleMapping}
            removeUploadItem={removeUploadItem}
          />
        )}

        {fileName && !uploadItems.length && <p className="muted-text">Loaded file: <strong>{fileName}</strong> · {rows.length} raw row(s)</p>}
        {status && <div className="import-status-box" role="status" aria-live="polite">{status}</div>}
        <BalanceVerificationPanel verification={importVerification} mode="result" />
        {uploadItems.length > 0 && <div className="modal-actions"><button type="button" className="primary-button" onClick={() => analyseImport()}>Analyse all CSVs</button></div>}
      </section>

      {headers.length > 0 && uploadItems.length === 0 && (
        <section className="card import-workflow-card">
          <div className="section-header compact-header">
            <div>
              <h3>2. Map columns</h3>
            </div>
            <button className="primary-button" onClick={() => analyseImport()}>Analyse import</button>
          </div>

          <div className="form-grid import-map-grid">
            <ColumnSelect label="Date" field="date" value={columnMap.date} headers={headers} update={updateColumnMap} required />
            <ColumnSelect label="Time" field="time" value={columnMap.time} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Description" field="description" value={columnMap.description} headers={headers} update={updateColumnMap} required />
            <ColumnSelect label="Signed amount" field="amount" value={columnMap.amount} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Paid in" field="paidIn" value={columnMap.paidIn} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Paid out" field="paidOut" value={columnMap.paidOut} headers={headers} update={updateColumnMap} />
            <ColumnSelect label="Balance / closing balance" field="balance" value={columnMap.balance} headers={headers} update={updateColumnMap} />
          </div>
        </section>
      )}

      {analysis && (
        <>
          <section className="summary-grid import-summary-grid">
            <SummaryItem label="Rows found" value={analysis.totals.total} />
            <SummaryItem label="New" value={analysis.totals.newRows} />
            <SummaryItem label="Transfers" value={analysis.totals.transfers} />
            <SummaryItem label="Matched" value={analysis.totals.plannedMatches + analysis.totals.existingTransferMatches} />
            <SummaryItem label="Needs review" value={analysis.totals.needsReview} />
            <SummaryItem label="Large expenses" value={analysis.totals.largeExpenses || 0} />
          </section>

          <ImportAnalysisSummary analysis={analysis} />

          <section className="card import-workflow-card">
            <div className="section-header compact-header">
              <div>
                <h3>{analysis.isMulti ? "3. Review combined import" : "3. Balance reconciliation"}</h3>
              </div>
            </div>
            {analysis.isMulti ? (
              <>
                <div className="import-reconciliation-box muted-box">
                  <strong>Combined statement review</strong>
                  <span>The transaction review below combines all files and orders every row by date so transfers between accounts are easy to spot. Overlapping statements for the same account are merged: rows on both are only imported once (from the newer statement), and rows only on the newer one — usually payments that were still pending when the older one was downloaded — are kept.</span>
                </div>
                {analysis.files.map(fileAnalysis => (
                  <BalanceChainCheckBox key={fileAnalysis.id} check={fileAnalysis.balanceChainCheck} label={fileAnalysis.fileName} />
                ))}
              </>
            ) : (
              <>
                <BalanceChainCheckBox check={analysis.balanceChainCheck} />
                <ReconciliationPreview
                  appData={baseData}
                  analysis={analysis}
                  rowEdits={rowEdits}
                  trusted={isAccountTrusted(analysis.accountId)}
                />
              </>
            )}
            {getAccountRanges(analysis).map(range => (
              <ReplacePeriodPanel
                key={range.accountId}
                range={range}
                accountName={appData.accounts.find(account => account.id === range.accountId)?.name || "Account"}
                appData={appData}
                activePlan={replacePlans[range.accountId] || null}
                editor={replaceEditor?.accountId === range.accountId ? replaceEditor : null}
                openEditor={openReplaceEditor}
                updateEditor={setReplaceEditor}
                applyEditor={applyReplaceEditor}
                stopReplacing={stopReplacing}
              />
            ))}
          </section>

          <section className="table-card import-preview-card">
            <div className="import-preview-header">
              <div>
                <h3>{analysis.isMulti ? "4. Review all statements together" : "4. Review rows before importing"}</h3>
                <p className="muted-text">{analysis.isMulti ? "All statements are combined and sorted by date. Opposite-sign matches across accounts are highlighted as transfers." : "Untick anything you do not want. Transfers need the other GH account selected before import."}</p>
              </div>
              <div className="import-preview-header-actions">
                <button type="button" className="secondary-button" onClick={previewImportResult}>Preview projected balances</button>
                <button className="primary-button" onClick={confirmImport}>Confirm import</button>
              </div>
            </div>

            <label className="checkbox-label import-reconcile-toggle">
              <input
                type="checkbox"
                checked={trustCsvByDefault}
                onChange={event => updateTrustCsvByDefault(event.target.checked)}
              />
              Trust the CSV balance on import — if the calculated balance doesn't match the bank's, add dated adjustments so it does. (Can be changed per account under "Preview projected balances".)
            </label>

            <BalanceVerificationPanel
              verification={previewVerification}
              mode="preview"
              analysis={analysis}
              rowEdits={effectiveRowEdits}
              appData={baseData}
              projectedData={previewProjection}
              isTrusted={isAccountTrusted}
              onSetTrusted={setAccountTrusted}
              onFixOpeningBalance={fixOpeningBalance}
            />

            <div className="import-filter-row">
              {previewFilters.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${activeFilter === key ? "active" : ""}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {label} <span>{getFilterCount(analysis.rows, effectiveRowEdits, key)}</span>
                </button>
              ))}
            </div>

            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>Import?</th>
                  <th>Date</th>
                  {analysis.isMulti && <th>Statement / account</th>}
                  <th>Description</th>
                  <th className="numeric">Amount</th>
                  <th>Action</th>
                  <th>Type / category</th>
                  <th>Transfer account</th>
                  <th>Budget</th>
                  <th>Match / warning</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowPosition) => (
                  <ImportPreviewRow
                    key={row.id}
                    row={row}
                    nextVisibleRowId={visibleRows[rowPosition + 1]?.id}
                    analysis={analysis}
                    rowEdits={effectiveRowEdits}
                    appData={appData}
                    baseData={baseData}
                    activeAccounts={activeAccounts}
                    selectedAccountId={selectedAccountId}
                    incomeCategories={incomeCategories}
                    expenseCategories={expenseCategories}
                    updateRow={updateRow}
                    handleTransferAccountChange={handleTransferAccountChange}
                    markRowNotATransfer={markRowNotATransfer}
                    rejectCrossFileMatch={rejectCrossFileMatch}
                    openDuplicateReview={openDuplicateReview}
                  />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <ImportHistory
        batches={latestImportBatches}
        accounts={appData.accounts}
        onViewDetails={setDetailBatchId}
        onUndo={undoImport}
      />

      {detailBatchId && (
        <ImportBatchDetailModal
          batch={(appData.importBatches || []).find(item => item.id === detailBatchId)}
          appData={appData}
          close={() => setDetailBatchId(null)}
          undoImport={undoImport}
        />
      )}

      {duplicateReviewRowId && (
        <DuplicateReviewModal
          row={analysis?.rows.find(row => row.id === duplicateReviewRowId)}
          existingTransaction={(appData.transactions || []).find(transaction => transaction.id === analysis?.rows.find(row => row.id === duplicateReviewRowId)?.duplicateTransactionId)}
          appData={appData}
          close={closeDuplicateReview}
          updateRow={updateRow}
          updateExistingDuplicate={updateExistingDuplicate}
          keepExisting={keepExistingDuplicate}
          onUseImported={applyImportedDuplicate}
        />
      )}

      {accountModal && (
        <ImportAccountModal
          form={accountForm}
          validation={accountValidation}
          updateForm={updateAccountForm}
          onSave={saveNewAccount}
          onClose={closeAccountModal}
        />
      )}
    </div>
  );
}
