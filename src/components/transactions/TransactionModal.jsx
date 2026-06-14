import { useEffect, useMemo, useState } from "react";
import { todayIsoDate } from "../../utils/dates.js";
import { HOUSE_CONTRIBUTION_TYPES } from "../../utils/houseTracking.js";
import { createId } from "../../utils/ids.js";
import { upsertTransaction } from "../../services/transactionService.js";
import { estimateLoanPaymentSplit } from "../../utils/loanLinking.js";
import { deleteStoredReceipt, getStoredReceipt, saveTransactionReceipt } from "../../services/receiptStorageService.js";

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  if (value >= 1024) return `${Math.round((value / 1024) * 10) / 10} KB`;
  return `${value} B`;
}

export default function TransactionModal({ appData, actions, editingTransaction }) {
  const isEditing = Boolean(editingTransaction);
  const [transactionId] = useState(() => editingTransaction?.id || createId("txn"));
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState(() => ({
    id: transactionId,
    type: editingTransaction?.type || "expense",
    date: editingTransaction?.date || todayIsoDate(),
    amount: editingTransaction?.amount || "",
    title: editingTransaction?.title || "",
    note: editingTransaction?.note || "",
    categoryId: editingTransaction?.categoryId || "",
    accountId: editingTransaction?.accountId || "acc_current",
    fromAccountId: editingTransaction?.fromAccountId || "acc_current",
    toAccountId: editingTransaction?.toAccountId || "acc_savings",
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
    createdAt: editingTransaction?.createdAt
  }));

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

  const activeLoans = useMemo(() => (
    (appData.loans || []).filter(loan => loan.status !== "archived" && loan.status !== "closed")
  ), [appData.loans]);
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

  const largeExpenseThreshold = Number(appData.settings?.largeExpenseThreshold || 200);
  const amountValue = Number(form.amount || 0);
  const isLargeExpense = form.type === "expense" && amountValue >= largeExpenseThreshold;

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
        if (!cancelled) setReceiptPreview({ error: error.message || "Could not load stored receipt." });
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

    if (file.size > 10 * 1024 * 1024) {
      setReceiptError("Receipt is too large. Use a file under 10 MB.");
      event.target.value = "";
      return;
    }

    setReceiptFile(file);
    setRemoveExistingReceipt(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return alert("Enter an amount above zero.");

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

      actions.updateAppData(nextData, { reason: receiptFile ? "Transaction receipt attached" : "Transaction saved" });
      actions.closeTransactionModal();
    } catch (error) {
      console.error("Could not save transaction or receipt:", error);
      setReceiptError(error.message || "Could not save receipt. Try a smaller file or different format.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasExistingReceipt = Boolean(form.receiptId && !removeExistingReceipt);

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submit}>
        <div className="section-header">
          <h2>{isEditing ? "Edit transaction" : "Add transaction"}</h2>
          <button type="button" className="icon-button" onClick={actions.closeTransactionModal}>×</button>
        </div>

        <div className="form-grid">
          <label>
            Type
            <select value={form.type} onChange={e => update("type", e.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="400.00"
              value={form.amount}
              onChange={e => update("amount", e.target.value)}
            />
          </label>

          <label>
            Date
            <input type="date" value={form.date} onChange={e => update("date", e.target.value)} />
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

              {form.type === "expense" && (
                <label className={`checkbox-label full-width exclude-budget-toggle ${isLargeExpense ? "highlight" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.excludeFromBudget}
                    onChange={e => update("excludeFromBudget", e.target.checked)}
                  />
                  <span>Exclude from monthly budget</span>
                </label>
              )}

              {form.type === "expense" && (
                <div className="loan-link-box full-width">
                  <div className="section-header compact-header">
                    <div>
                      <h4>Loan / mortgage link</h4>
                    </div>
                  </div>

                  <label>
                    Is this linked to a loan?
                    <select value={form.linkedLoanId || ""} onChange={e => update("linkedLoanId", e.target.value)}>
                      <option value="">No</option>
                      {activeLoans.map(loan => (
                        <option key={loan.id} value={loan.id}>{loanName(loan)}</option>
                      ))}
                    </select>
                  </label>

                  {selectedLoan && (
                    <div className="loan-link-split-grid">
                      <label>
                        Interest part
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.loanInterestAmount}
                          onChange={e => update("loanInterestAmount", e.target.value)}
                          placeholder="Estimated or from statement"
                        />
                      </label>

                      <label>
                        Capital / principal paid off
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.loanPrincipalAmount}
                          onChange={e => update("loanPrincipalAmount", e.target.value)}
                          placeholder="Amount reducing the balance"
                        />
                      </label>

                      <label className="checkbox-label full-width">
                        <input
                          type="checkbox"
                          checked={form.isLoanOverpayment}
                          onChange={e => update("isLoanOverpayment", e.target.checked)}
                        />
                        <span>This includes an overpayment</span>
                      </label>

                      {form.isLoanOverpayment && (
                        <label>
                          Overpayment amount
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.loanOverpaymentAmount}
                            onChange={e => update("loanOverpaymentAmount", e.target.value)}
                            placeholder="Extra amount above normal payment"
                          />
                        </label>
                      )}

                      <div className="loan-link-actions full-width">
                        <button type="button" className="secondary-button small" onClick={autoEstimateLoanSplit}>Auto-estimate split</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.type === "expense" && activeHouses.length > 0 && (
                <div className="loan-link-box full-width">
                  <div className="section-header compact-header">
                    <div>
                      <h4>House link</h4>
                      <p className="muted-text">Linked house payments still affect this account balance as normal, then also count in House contributions.</p>
                    </div>
                  </div>

                  <label>
                    Link to house
                    <select value={form.linkedHouseId || ""} onChange={e => update("linkedHouseId", e.target.value)}>
                      <option value="">No house link</option>
                      {activeHouses.map(house => (
                        <option key={house.id} value={house.id}>{house.name}</option>
                      ))}
                    </select>
                  </label>

                  {selectedHouse && (
                    <div className="loan-link-split-grid">
                      <label>
                        Contribution type
                        <select value={form.houseContributionType} onChange={e => update("houseContributionType", e.target.value)}>
                          {HOUSE_CONTRIBUTION_TYPES.map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Paid by
                        <select value={form.housePersonId || ""} onChange={e => update("housePersonId", e.target.value)}>
                          <option value="">Unassigned</option>
                          {selectedHousePeople.map(person => (
                            <option key={person.id} value={person.id}>{person.name}</option>
                          ))}
                        </select>
                      </label>

                      {selectedHousePeople.length === 0 && (
                        <p className="muted-text full-width">Add people in Loans, House, People / Splits to attribute this payment.</p>
                      )}

                      <label className="full-width">
                        House contribution note
                        <input
                          value={form.houseContributionNotes}
                          onChange={e => update("houseContributionNotes", e.target.value)}
                          placeholder="Safe note for the house contribution"
                        />
                      </label>
                    </div>
                  )}
                </div>
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
                <select value={form.toAccountId} onChange={e => update("toAccountId", e.target.value)}>
                  {(appData.accounts || []).filter(acc => acc.isActive !== false).map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
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
            <div className="recurring-options full-width">
              <label>
                Amount type
                <select value={form.recurringAmountType} onChange={e => update("recurringAmountType", e.target.value)}>
                  <option value="fixed">Fixed</option>
                  <option value="variable">Variable</option>
                </select>
              </label>

              <label>
                Frequency
                <select value={form.recurringFrequency} onChange={e => update("recurringFrequency", e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="every_4_weeks">Every 4 weeks</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              <label>
                Next due date
                <input
                  type="date"
                  value={form.recurringNextDueDate}
                  onChange={e => update("recurringNextDueDate", e.target.value)}
                />
              </label>

              <label>
                Add behaviour
                <select
                  value={form.recurringAutoAdd ? "auto" : "confirm"}
                  onChange={e => update("recurringAutoAdd", e.target.value === "auto")}
                >
                  <option value="auto">Auto-add fixed bills</option>
                  <option value="confirm">Confirm manually</option>
                </select>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.recurringReminderEnabled}
                  onChange={e => update("recurringReminderEnabled", e.target.checked)}
                />
                <span>Reminder enabled</span>
              </label>
            </div>
          )}

          <div className="receipt-field full-width">
            <div className="section-header compact-header">
              <div>
                <h4>Receipt attachment</h4>
                <p className="muted-text">Stored locally in IndexedDB. Use images or PDF files under 10 MB.</p>
              </div>
              <span className="pill">V2.4</span>
            </div>

            {hasExistingReceipt && (
              <div className="receipt-current-card">
                <div>
                  <strong>{form.receiptFileName || "Stored receipt"}</strong>
                  <small>{formatFileSize(form.receiptSizeBytes)} · {form.receiptUploadedAt ? new Date(form.receiptUploadedAt).toLocaleString("en-GB") : "Stored locally"}</small>
                </div>
                {receiptPreview?.url && receiptPreview.mimeType?.startsWith("image/") && (
                  <img src={receiptPreview.url} alt="Receipt preview" className="receipt-thumb" />
                )}
                {receiptPreview?.missing && <small className="danger-text">Receipt link exists, but the stored file was not found on this device.</small>}
                {receiptPreview?.error && <small className="danger-text">{receiptPreview.error}</small>}
                <button type="button" className="secondary-button small" onClick={() => { setRemoveExistingReceipt(true); setReceiptFile(null); }}>
                  Remove receipt
                </button>
              </div>
            )}

            {removeExistingReceipt && !receiptFile && (
              <div className="receipt-warning-box">Receipt will be removed when you save this transaction.</div>
            )}

            {receiptFile && (
              <div className="receipt-current-card selected-receipt-card">
                <div>
                  <strong>Selected: {receiptFile.name}</strong>
                  <small>{formatFileSize(receiptFile.size)} · will be attached when saved</small>
                </div>
                <button type="button" className="secondary-button small" onClick={() => setReceiptFile(null)}>Clear selected file</button>
              </div>
            )}

            <label>
              {hasExistingReceipt ? "Replace receipt" : "Attach receipt"}
              <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleReceiptFile} />
            </label>
            {receiptError && <small className="danger-text">{receiptError}</small>}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={actions.closeTransactionModal}>Cancel</button>
          <button className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Saving..." : isEditing ? "Save changes" : "Add transaction"}</button>
        </div>
      </form>
    </div>
  );
}
