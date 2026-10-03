import { useEffect, useMemo, useState } from "react";
import { logError } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import { todayIsoDate } from "../../utils/dates.js";
import { createId } from "../../utils/ids.js";
import { getMatchingExclusionRules, linkTransferPair, unlinkTransferPair, upsertTransaction } from "../../services/transactionService.js";
import { estimateLoanPaymentSplit, getActiveLoans } from "../../utils/loanLinking.js";
import { MAX_RECEIPT_BYTES, deleteStoredReceipt, getStoredReceipt, saveTransactionReceipt } from "../../services/receiptStorageService.js";
import { checkMoneyAmount, checkRequiredDate, collectErrors } from "../../utils/validation.js";
import useFormErrors from "../../hooks/useFormErrors.js";
import { ErrorSummary, FieldError, FormError, RequiredMark } from "../common/FormFeedback.jsx";
import { DEFAULT_ACCOUNT_ID } from "../../data/defaultAccounts.js";
import { DEFAULT_LARGE_EXPENSE_THRESHOLD } from "../../config/appDefaults.js";
import { TransferLinkPicker } from "./TransferLinkPicker.jsx";
import { LoanLinkFields } from "./LoanLinkFields.jsx";
import { HouseLinkFields } from "./HouseLinkFields.jsx";
import { RecurringOptions } from "./RecurringOptions.jsx";
import { ReceiptField } from "./ReceiptField.jsx";
import { X } from "lucide-react";

function validateTransactionForm(values) {
  return collectErrors({
    amount: checkMoneyAmount(values.amount),
    date: checkRequiredDate(values.date, "the date of the transaction"),
    toAccountId: values.type === "transfer" && values.fromAccountId && values.fromAccountId === values.toAccountId
      ? "Choose a different account. A transfer moves money between two accounts."
      : ""
  });
}

// If you're converting an existing expense/income into a transfer, the
// account it's already on is almost always the side you want to keep — an
// expense becomes the "from" account, income becomes "to" — leaving just
// the other account to pick. Falls back to an actual active account rather
// than a hardcoded id that might not exist in this data, so From/To never
// silently default to the same account.
function getDefaultFromAccountId(appData, editingTransaction) {
  if (editingTransaction && editingTransaction.type !== "income") return editingTransaction.accountId;
  const accounts = (appData.accounts || []).filter(acc => acc.isActive !== false);
  return accounts.find(acc => acc.id === DEFAULT_ACCOUNT_ID)?.id || accounts[0]?.id || DEFAULT_ACCOUNT_ID;
}

function getDefaultToAccountId(appData, editingTransaction, fromAccountId) {
  if (editingTransaction && editingTransaction.type === "income") return editingTransaction.accountId;
  const accounts = (appData.accounts || []).filter(acc => acc.isActive !== false);
  const preferred = accounts.find(acc => acc.id === "acc_savings" && acc.id !== fromAccountId);
  if (preferred) return preferred.id;
  return accounts.find(acc => acc.id !== fromAccountId)?.id || accounts[0]?.id || "acc_savings";
}

export default function TransactionModal({ appData, actions, editingTransaction }) {
  const isEditing = Boolean(editingTransaction);
  const [transactionId] = useState(() => editingTransaction?.id || createId("txn"));
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const { errors, getFieldId, validateAll, validateFieldOnBlur, clearFixedErrors, fieldProps } = useFormErrors("transaction", validateTransactionForm);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const [form, setForm] = useState(() => {
    const fromAccountId = getDefaultFromAccountId(appData, editingTransaction);
    const toAccountId = getDefaultToAccountId(appData, editingTransaction, fromAccountId);
    return {
    id: transactionId,
    type: editingTransaction?.type || "expense",
    date: editingTransaction?.date || todayIsoDate(),
    amount: editingTransaction?.amount || "",
    title: editingTransaction?.title || "",
    note: editingTransaction?.note || "",
    categoryId: editingTransaction?.categoryId || "",
    accountId: editingTransaction?.accountId || DEFAULT_ACCOUNT_ID,
    fromAccountId,
    toAccountId,
    linkedSavingsGoalId: editingTransaction?.linkedSavingsGoalId || "",
    linkedLoanId: editingTransaction?.linkedLoanId || "",
    linkedHouseId: editingTransaction?.linkedHouseId || "",
    linkedHouseContributionId: editingTransaction?.linkedHouseContributionId || null,
    houseContributionType: editingTransaction?.houseContributionType || "mortgagePayment",
    housePersonId: editingTransaction?.housePersonId || "",
    housePersonName: editingTransaction?.housePersonName || "",
    houseContributionNotes: editingTransaction?.houseContributionNotes || "",
    loanInterestAmount: editingTransaction?.loanInterestAmount ?? "",
    loanPrincipalAmount: editingTransaction?.loanPrincipalAmount ?? "",
    isLoanOverpayment: Boolean(editingTransaction?.isLoanOverpayment),
    loanOverpaymentAmount: editingTransaction?.loanOverpaymentAmount ?? "",
    isRecurring: editingTransaction?.isRecurring || false,
    recurringItemId: editingTransaction?.recurringItemId || null,
    recurringAmountType: editingTransaction?.recurringAmountType || "fixed",
    recurringFrequency: editingTransaction?.recurringFrequency || "monthly",
    recurringNextDueDate: editingTransaction?.recurringNextDueDate || editingTransaction?.date || todayIsoDate(),
    recurringAutoAdd: editingTransaction?.recurringAutoAdd ?? true,
    recurringReminderEnabled: editingTransaction?.recurringReminderEnabled ?? true,
    receiptId: editingTransaction?.receiptId || null,
    receiptFileName: editingTransaction?.receiptFileName || null,
    receiptMimeType: editingTransaction?.receiptMimeType || null,
    receiptSizeBytes: editingTransaction?.receiptSizeBytes || 0,
    receiptUploadedAt: editingTransaction?.receiptUploadedAt || null,
    excludeFromBudget: Boolean(editingTransaction?.excludeFromBudget),
    excludeFromTotal: Boolean(editingTransaction?.excludeFromTotal),
    excludeFromChart: Boolean(editingTransaction?.excludeFromChart),
    ruleExempt: Boolean(editingTransaction?.ruleExempt),
    createdAt: editingTransaction?.createdAt
    };
  });

  useEffect(() => {
    clearFixedErrors(form);
    // Only re-check when the form values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const categories = useMemo(() => (
    (appData.categories || []).filter(category => category.isActive !== false && !category.isArchived && !category.archivedAt && category.type === form.type)
  ), [appData.categories, form.type]);
  const linkedArchivedCategory = form.categoryId
    ? (appData.categories || []).find(category => (
        category.id === form.categoryId
        && category.type === form.type
        && !categories.some(activeCategory => activeCategory.id === category.id)
      ))
    : null;

  const activeLoans = useMemo(() => getActiveLoans({ loans: appData.loans }), [appData.loans]);
  const selectedLoan = activeLoans.find(loan => loan.id === form.linkedLoanId) || null;
  const activeHouses = useMemo(() => (
    (appData.houses || []).filter(house => house.status !== "archived" && !house.archived)
  ), [appData.houses]);
  const selectedHouse = activeHouses.find(house => house.id === form.linkedHouseId) || null;
  const selectedHousePeople = useMemo(() => (
    (appData.housePeople || []).filter(person => person.houseId === form.linkedHouseId)
  ), [appData.housePeople, form.linkedHouseId]);
  const activeSavingsGoals = useMemo(() => (
    (appData.savingsGoals || []).filter(goal => goal.isActive !== false && !goal.isArchived && !goal.archivedAt)
  ), [appData.savingsGoals]);
  const linkedArchivedSavingsGoal = form.linkedSavingsGoalId
    ? (appData.savingsGoals || []).find(goal => goal.id === form.linkedSavingsGoalId && !activeSavingsGoals.some(activeGoal => activeGoal.id === goal.id))
    : null;

  const largeExpenseThreshold = Number(appData.settings?.largeExpenseThreshold || DEFAULT_LARGE_EXPENSE_THRESHOLD);
  const amountValue = Number(form.amount || 0);
  const isLargeExpense = form.type === "expense" && amountValue >= largeExpenseThreshold;

  const linkedTransferPartner = editingTransaction?.transferLinkId
    ? (appData.transactions || []).find(item => item.id === editingTransaction.transferLinkId)
    : null;
  const linkedTransferPartnerAccount = linkedTransferPartner
    ? (appData.accounts || []).find(account => account.id === linkedTransferPartner.accountId)
    : null;

  const matchingExclusionRules = useMemo(() => (
    getMatchingExclusionRules({ title: form.title }, appData.exclusionRules)
  ), [form.title, appData.exclusionRules]);

  // Candidates for "link to an existing transaction": the opposite type
  // (an expense pairs with an income leg and vice versa) — which, since
  // both sides of a real transfer move the exact same amount of money in
  // opposite directions, means the exact same amount too. Only an exact
  // match (to the penny) is shown, so this can never suggest pairing two
  // transactions that just happen to be similar; ties are broken by how
  // close the date is.
  const linkCandidates = useMemo(() => {
    if (!editingTransaction || editingTransaction.transferLinkId) return [];
    const oppositeType = editingTransaction.type === "expense" ? "income" : "expense";
    const search = linkSearch.trim().toLowerCase();
    const currentDate = new Date(form.date || editingTransaction.date).getTime();
    const currentAmount = Number(form.amount || editingTransaction.amount || 0);

    return (appData.transactions || [])
      .filter(item => (
        item.id !== editingTransaction.id
        && !item.transferLinkId
        && item.type === oppositeType
        && Math.abs(Number(item.amount || 0) - currentAmount) <= 0.005
      ))
      .filter(item => {
        if (!search) return true;
        const account = (appData.accounts || []).find(acc => acc.id === item.accountId);
        return (item.title || "").toLowerCase().includes(search)
          || (account?.name || "").toLowerCase().includes(search);
      })
      .sort((a, b) => Math.abs(new Date(a.date).getTime() - currentDate) - Math.abs(new Date(b.date).getTime() - currentDate))
      .slice(0, 25);
  }, [appData.transactions, appData.accounts, editingTransaction, linkSearch, form.date, form.amount]);

  function unlinkFromTransfer() {
    if (!editingTransaction?.transferLinkId) return;
    if (!confirm("Unlink this from its transfer partner? Both transactions stay, but they'll no longer be shown as a linked transfer.")) return;
    const nextData = unlinkTransferPair(appData, editingTransaction.id);
    actions.updateAppData(nextData, { reason: "Transfer link removed" });
    actions.closeTransactionModal();
  }

  function linkToExistingTransaction(otherTransactionId) {
    if (!editingTransaction) return;
    const nextData = linkTransferPair(appData, editingTransaction.id, otherTransactionId);
    actions.updateAppData(nextData, { reason: "Transfer linked", rulesTrigger: "transfer" });
    actions.closeTransactionModal();
  }

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    async function loadReceiptPreview() {
      if (!form.receiptId || receiptFile || removeExistingReceipt) {
        setReceiptPreview(null);
        return;
      }

      try {
        const record = await getStoredReceipt(form.receiptId);
        if (!record || cancelled) {
          setReceiptPreview(record ? null : { missing: true });
          return;
        }

        objectUrl = URL.createObjectURL(record.blob);
        setReceiptPreview({
          url: objectUrl,
          mimeType: record.mimeType,
          fileName: record.fileName,
          sizeBytes: record.sizeBytes
        });
      } catch (error) {
        if (!cancelled) setReceiptPreview({ error: getErrorMessage(error, "Couldn't load stored receipt. Try again in a moment.") });
      }
    }

    loadReceiptPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [form.receiptId, receiptFile, removeExistingReceipt]);

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };

      if (field === "type" && value !== "expense") {
        next.linkedLoanId = "";
        next.linkedHouseId = "";
        next.houseContributionType = "mortgagePayment";
        next.housePersonId = "";
        next.housePersonName = "";
        next.houseContributionNotes = "";
        next.loanInterestAmount = "";
        next.loanPrincipalAmount = "";
        next.isLoanOverpayment = false;
        next.loanOverpaymentAmount = "";
      }

      if (field === "linkedLoanId" && !value) {
        next.loanInterestAmount = "";
        next.loanPrincipalAmount = "";
        next.isLoanOverpayment = false;
        next.loanOverpaymentAmount = "";
      }

      if (field === "linkedHouseId") {
        next.housePersonId = "";
        next.housePersonName = "";
        if (!value) {
          next.houseContributionType = "mortgagePayment";
          next.houseContributionNotes = "";
        }
      }

      if (field === "housePersonId") {
        const person = (appData.housePeople || []).find(item => item.id === value);
        next.housePersonName = person?.name || "";
      }

      if (field === "isLoanOverpayment" && value && !prev.loanOverpaymentAmount) {
        next.loanOverpaymentAmount = prev.loanPrincipalAmount || prev.amount || "";
      }

      return next;
    });
  }

  function autoEstimateLoanSplit() {
    if (!selectedLoan || !form.amount) return;
    const split = estimateLoanPaymentSplit(Number(form.amount || 0), selectedLoan);
    setForm(prev => ({
      ...prev,
      loanInterestAmount: split.interestAmount ? String(split.interestAmount) : "0",
      loanPrincipalAmount: split.principalAmount ? String(split.principalAmount) : "0",
      loanOverpaymentAmount: prev.isLoanOverpayment ? String(split.principalAmount || prev.amount || 0) : prev.loanOverpaymentAmount
    }));
  }

  function loanName(loan) {
    const typeLabel = loan.type === "mortgage" ? "Mortgage" : loan.type === "studentLoan" ? "Student loan" : "Loan";
    return `${typeLabel}: ${loan.name}`;
  }

  function handleReceiptFile(event) {
    const file = event.target.files?.[0] || null;
    setReceiptError("");

    if (!file) {
      setReceiptFile(null);
      return;
    }

    const allowed = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!allowed) {
      setReceiptError("Choose an image or PDF receipt file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_RECEIPT_BYTES) {
      setReceiptError("That receipt is too large. Use a file under 10 MB — for a photo, a smaller image size usually works.");
      event.target.value = "";
      return;
    }

    setReceiptFile(file);
    setRemoveExistingReceipt(false);
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    if (!validateAll(form)) return;

    setIsSubmitting(true);
    setReceiptError("");

    try {
      let receiptMeta = {
        receiptId: removeExistingReceipt ? null : form.receiptId,
        receiptFileName: removeExistingReceipt ? null : form.receiptFileName,
        receiptMimeType: removeExistingReceipt ? null : form.receiptMimeType,
        receiptSizeBytes: removeExistingReceipt ? 0 : form.receiptSizeBytes,
        receiptUploadedAt: removeExistingReceipt ? null : form.receiptUploadedAt
      };

      if (receiptFile) {
        receiptMeta = await saveTransactionReceipt(transactionId, receiptFile);
      }

      if ((removeExistingReceipt || receiptFile) && editingTransaction?.receiptId && editingTransaction.receiptId !== receiptMeta.receiptId) {
        await deleteStoredReceipt(editingTransaction.receiptId);
      }

      const nextData = upsertTransaction(
        appData,
        { ...form, id: transactionId, ...receiptMeta },
        isEditing ? transactionId : null
      );

      actions.updateAppData(nextData, {
        reason: receiptFile ? "Transaction receipt attached" : "Transaction saved",
        rulesTrigger: form.type === "transfer" && !isEditing ? "transfer" : null
      });
      actions.closeTransactionModal();
    } catch (error) {
      logError("Could not save transaction or receipt", error);
      setFormError(getErrorMessage(error, "The transaction couldn't be saved. If you attached a receipt, try a smaller file (under 10 MB) as a JPG, PNG or PDF."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasExistingReceipt = Boolean(form.receiptId && !removeExistingReceipt);

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submit} noValidate>
        <div className="section-header">
          <h2>{isEditing ? "Edit transaction" : "Add transaction"}</h2>
          <button type="button" className="icon-button" onClick={actions.closeTransactionModal} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>

        <ErrorSummary errors={errors} getFieldId={getFieldId} />

        <div className="form-grid">
          <label>
            Type
            <select value={form.type} onChange={e => update("type", e.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              {!editingTransaction?.transferLinkId && <option value="transfer">Transfer</option>}
            </select>
          </label>

          {linkedTransferPartner && (
            <div className="full-width receipt-warning-box">
              Linked transfer with {linkedTransferPartnerAccount?.name || "another account"}.{" "}
              <button type="button" className="secondary-button small" onClick={unlinkFromTransfer}>Unlink transfer</button>
            </div>
          )}

          {isEditing && !editingTransaction.transferLinkId && form.type !== "transfer" && (
            <TransferLinkPicker
              appData={appData}
              editingTransaction={editingTransaction}
              form={form}
              linkCandidates={linkCandidates}
              linkSearch={linkSearch}
              linkToExistingTransaction={linkToExistingTransaction}
              setLinkSearch={setLinkSearch}
              setShowLinkPicker={setShowLinkPicker}
              showLinkPicker={showLinkPicker}
            />
          )}

          <label>
            <span>Amount<RequiredMark /></span>
            <input
              {...fieldProps("amount")}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="400.00"
              aria-required="true"
              value={form.amount}
              onChange={e => update("amount", e.target.value)}
              onBlur={() => validateFieldOnBlur("amount", form)}
            />
            <FieldError fieldId={getFieldId("amount")} message={errors.amount} />
          </label>

          <label>
            <span>Date<RequiredMark /></span>
            <input
              {...fieldProps("date")}
              type="date"
              aria-required="true"
              value={form.date}
              onChange={e => update("date", e.target.value)}
            />
            <FieldError fieldId={getFieldId("date")} message={errors.date} />
          </label>

          <label>
            Title
            <input placeholder="Tesco food shop" value={form.title} onChange={e => update("title", e.target.value)} />
          </label>

          {form.type !== "transfer" ? (
            <>
              <label>
                Category
                <select value={form.categoryId} onChange={e => update("categoryId", e.target.value)}>
                  <option value="">Choose category</option>
                  {linkedArchivedCategory && (
                    <option value={linkedArchivedCategory.id}>{linkedArchivedCategory.name || "Archived category"} (archived)</option>
                  )}
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Account
                <select value={form.accountId} onChange={e => update("accountId", e.target.value)}>
                  {(appData.accounts || []).filter(acc => acc.isActive !== false).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>

              {form.type !== "transfer" && (
                <div className="exclude-toggle-group full-width">
                  {form.type === "expense" && (
                    <label className={`checkbox-label exclude-budget-toggle ${isLargeExpense ? "highlight" : ""}`}>
                      <input
                        type="checkbox"
                        checked={form.excludeFromBudget}
                        onChange={e => update("excludeFromBudget", e.target.checked)}
                      />
                      <span>Exclude from monthly budget</span>
                    </label>
                  )}
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.excludeFromTotal}
                      onChange={e => update("excludeFromTotal", e.target.checked)}
                    />
                    <span>Exclude from {form.type === "income" ? "Income" : "Spent"} total this month</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.excludeFromChart}
                      onChange={e => update("excludeFromChart", e.target.checked)}
                    />
                    <span>Hide from charts</span>
                  </label>

                  {matchingExclusionRules.length > 0 && (
                    <div className="rule-match-notice">
                      <p className="muted-text">
                        Matches payment rule{matchingExclusionRules.length > 1 ? "s" : ""}: <strong>{matchingExclusionRules.map(rule => rule.matchText).join(", ")}</strong>
                      </p>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={form.ruleExempt}
                          onChange={e => update("ruleExempt", e.target.checked)}
                        />
                        <span>Exclude this transaction from rules (don't apply rule exclusions here)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {form.type === "income" && (
                <label>
                  Linked savings goal
                  <select value={form.linkedSavingsGoalId} onChange={e => update("linkedSavingsGoalId", e.target.value)}>
                    <option value="">None</option>
                    {linkedArchivedSavingsGoal && (
                      <option value={linkedArchivedSavingsGoal.id}>{linkedArchivedSavingsGoal.name || "Archived savings goal"} (archived)</option>
                    )}
                    {activeSavingsGoals.map(goal => (
                      <option key={goal.id} value={goal.id}>{goal.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {form.type === "expense" && (
                <LoanLinkFields
                  activeLoans={activeLoans}
                  autoEstimateLoanSplit={autoEstimateLoanSplit}
                  form={form}
                  loanName={loanName}
                  selectedLoan={selectedLoan}
                  update={update}
                />
              )}

              {form.type === "expense" && activeHouses.length > 0 && (
                <HouseLinkFields
                  activeHouses={activeHouses}
                  form={form}
                  selectedHouse={selectedHouse}
                  selectedHousePeople={selectedHousePeople}
                  update={update}
                />
              )}
            </>
          ) : (
            <>
              <label>
                From account
                <select value={form.fromAccountId} onChange={e => update("fromAccountId", e.target.value)}>
                  {(appData.accounts || []).filter(acc => acc.isActive !== false).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>

              <label>
                To account
                <select {...fieldProps("toAccountId")} value={form.toAccountId} onChange={e => update("toAccountId", e.target.value)}>
                  {(appData.accounts || []).filter(acc => acc.isActive !== false).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <FieldError fieldId={getFieldId("toAccountId")} message={errors.toAccountId} />
              </label>

              <label>
                Linked savings goal
                <select value={form.linkedSavingsGoalId} onChange={e => update("linkedSavingsGoalId", e.target.value)}>
                  <option value="">None</option>
                  {linkedArchivedSavingsGoal && (
                    <option value={linkedArchivedSavingsGoal.id}>{linkedArchivedSavingsGoal.name || "Archived savings goal"} (archived)</option>
                  )}
                  {activeSavingsGoals.map(goal => (
                    <option key={goal.id} value={goal.id}>{goal.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="full-width">
            Note
            <textarea placeholder="Optional note" value={form.note} onChange={e => update("note", e.target.value)} />
          </label>

          {form.type !== "transfer" && (
            <label className="checkbox-label full-width">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={e => update("isRecurring", e.target.checked)}
              />
              <span>Make this recurring</span>
            </label>
          )}

          {form.isRecurring && form.type !== "transfer" && (
            <RecurringOptions
              form={form}
              update={update}
            />
          )}

          <ReceiptField
            form={form}
            handleReceiptFile={handleReceiptFile}
            hasExistingReceipt={hasExistingReceipt}
            receiptError={receiptError}
            receiptFile={receiptFile}
            receiptPreview={receiptPreview}
            removeExistingReceipt={removeExistingReceipt}
            setReceiptFile={setReceiptFile}
            setRemoveExistingReceipt={setRemoveExistingReceipt}
          />
        </div>

        <FormError message={formError} />

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={actions.closeTransactionModal}>Cancel</button>
          <button className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Add transaction"}</button>
        </div>
      </form>
    </div>
  );
}
