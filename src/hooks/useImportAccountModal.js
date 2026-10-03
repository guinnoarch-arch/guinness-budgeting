import { useState } from "react";
import { createId } from "../utils/ids.js";
import { validateAccountForm } from "../utils/validation.js";
import useFormErrors from "./useFormErrors.js";
import { emptyAccountForm } from "../components/import/importSettings.js";

// The "Add account" pop-up on the Import page, used when a statement or a
// transfer belongs to an account that doesn't exist yet.
export default function useImportAccountModal({ actions, appData, setAnalysis, setSelectedAccountId, setStatus, updateRow }) {
  const [accountModal, setAccountModal] = useState(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const accountValidation = useFormErrors("import-account", validateAccountForm);

  function openAddAccountModal(context) {
    setAccountModal(context);
    setAccountForm({
      name: context.suggestedName || "",
      type: context.mode === "transfer" && context.suggestedName.toLowerCase().includes("saving") ? "savings" : "current",
      openingBalance: "0"
    });
  }

  function closeAccountModal() {
    setAccountModal(null);
    setAccountForm(emptyAccountForm);
    accountValidation.resetErrors();
  }

  function updateAccountForm(field, value) {
    const next = { ...accountForm, [field]: value };
    setAccountForm(next);
    accountValidation.clearFixedErrors(next);
  }

  function saveNewAccount(event) {
    event.preventDefault();

    if (!accountValidation.validateAll(accountForm)) return;
    const name = accountForm.name.trim();
    const openingBalance = parseFloat(accountForm.openingBalance || "0");

    const now = new Date().toISOString();
    const newAccount = {
      id: createId("acc"),
      name,
      type: accountForm.type,
      openingBalance,
      isDefault: false,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    actions.updateAppData({
      ...appData,
      accounts: [...appData.accounts, newAccount]
    });

    if (accountModal?.mode === "statement") {
      setSelectedAccountId(newAccount.id);
      setAnalysis(null);
    }

    if (accountModal?.mode === "transfer" && accountModal.rowId) {
      updateRow(accountModal.rowId, "linkedAccountId", newAccount.id);
      updateRow(accountModal.rowId, "include", true);
    }

    setStatus(`Added account: ${name}.`);
    closeAccountModal();
  }

  return {
    accountForm,
    accountModal,
    accountValidation,
    closeAccountModal,
    openAddAccountModal,
    saveNewAccount,
    updateAccountForm
  };
}
