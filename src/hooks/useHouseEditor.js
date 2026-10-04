import { useEffect, useState } from "react";
import { getErrorMessage } from "../utils/errors.js";
import { createId } from "../utils/ids.js";
import { todayIsoDate } from "../utils/dates.js";
import { normaliseHouseRecord } from "../utils/houseTracking.js";
import { addSharedHouseContribution, isHouseSharingSetupMissing } from "../services/houseSharingService.js";
import { blankContributionForm, blankHouseForm, blankPersonForm, validateContributionForm, validateHouseForm, validatePersonForm } from "../components/loans/loanForms.js";
import { useModalFormErrors } from "./useModalFormErrors.js";

// Adding and editing houses, contributions and the people on a house.
export default function useHouseEditor({ actions, appData, displayAppData, refreshSharedHouses, setSelectedHouseId, setSharingBusy, setSharingStatus }) {
  const [showHouseModal, setShowHouseModal] = useState(false);

  const [editingHouse, setEditingHouse] = useState(null);

  const [houseForm, setHouseForm] = useState(blankHouseForm);

  const [contributionHouse, setContributionHouse] = useState(null);

  const [editingContribution, setEditingContribution] = useState(null);

  const [contributionForm, setContributionForm] = useState(blankContributionForm);

  const [personHouse, setPersonHouse] = useState(null);

  const [personForm, setPersonForm] = useState(blankPersonForm);

  const [contributionFormError, setContributionFormError] = useState("");

  const houseValidation = useModalFormErrors("house", validateHouseForm, showHouseModal, houseForm);

  const contributionValidation = useModalFormErrors("contribution", validateContributionForm, Boolean(contributionHouse), contributionForm);

  const personValidation = useModalFormErrors("person", validatePersonForm, Boolean(personHouse), personForm);

  useEffect(() => {
    if (!contributionHouse) setContributionFormError("");
  }, [contributionHouse]);

  function updateHouseForm(field, value) {
    setHouseForm(prev => ({ ...prev, [field]: value }));
  }

  function openAddHouseModal() {
    setEditingHouse(null);
    setHouseForm({ ...blankHouseForm, name: "House" });
    setShowHouseModal(true);
  }

  function openEditHouseModal(house) {
    setEditingHouse(house);
    setHouseForm({
      ...blankHouseForm,
      name: house.name || "",
      addressLabel: house.addressLabel || "",
      purchasePrice: String(house.purchasePrice ?? ""),
      purchaseDate: house.purchaseDate || "",
      propertyValue: String(house.propertyValue ?? ""),
      agreementNotes: house.agreementNotes || "",
      notes: house.notes || "",
      ownershipMode: house.ownershipMode || "contributionTracking",
      mortgageOriginalAmount: String(house.mortgage?.originalAmount ?? ""),
      mortgageCurrentBalance: String(house.mortgage?.currentBalance ?? ""),
      mortgageStartDate: house.mortgage?.startDate || "",
      mortgageTermYears: String(house.mortgage?.termYears ?? ""),
      mortgageRemainingTermMonths: String(house.mortgage?.remainingTermMonths ?? ""),
      mortgageInterestRate: String(house.mortgage?.interestRate ?? ""),
      mortgageRateType: house.mortgage?.rateType || "fixed",
      mortgageRepaymentType: house.mortgage?.repaymentType || "repayment",
      mortgageFixedEndDate: house.mortgage?.fixedEndDate || "",
      mortgageFollowOnRate: String(house.mortgage?.followOnRate ?? ""),
      mortgageMonthlyPayment: String(house.mortgage?.monthlyPayment ?? ""),
      mortgagePaymentDay: String(house.mortgage?.paymentDay ?? "1"),
      mortgagePlannedMonthlyOverpayment: String(house.mortgage?.plannedMonthlyOverpayment ?? ""),
      mortgageOverpaymentAllowancePercent: String(house.mortgage?.overpaymentAllowancePercent ?? "10"),
      mortgageEarlyRepaymentChargeApplies: Boolean(house.mortgage?.earlyRepaymentChargeApplies),
      mortgageNotes: house.mortgage?.notes || "",
      linkedAccountId: house.mortgage?.linkedAccountId || ""
    });
    setShowHouseModal(true);
  }

  function closeHouseModal() {
    setShowHouseModal(false);
    setEditingHouse(null);
    setHouseForm(blankHouseForm);
  }

  function submitHouse(event) {
    event.preventDefault();
    if (!houseValidation.validateAll(houseForm)) return;
    const name = houseForm.name.trim();
    const now = new Date().toISOString();
    const housePayload = normaliseHouseRecord({
      ...(editingHouse || {}),
      id: editingHouse?.id || createId("house"),
      name,
      addressLabel: houseForm.addressLabel.trim(),
      purchasePrice: Number(houseForm.purchasePrice || 0),
      purchaseDate: houseForm.purchaseDate || null,
      propertyValue: Number(houseForm.propertyValue || 0),
      agreementNotes: houseForm.agreementNotes.trim(),
      notes: houseForm.notes.trim(),
      ownershipMode: houseForm.ownershipMode,
      status: editingHouse?.status || "active",
      archived: editingHouse?.archived || false,
      mortgage: {
        originalAmount: Number(houseForm.mortgageOriginalAmount || 0),
        currentBalance: Number(houseForm.mortgageCurrentBalance || 0),
        startDate: houseForm.mortgageStartDate || null,
        termYears: Number(houseForm.mortgageTermYears || 0),
        remainingTermMonths: Number(houseForm.mortgageRemainingTermMonths || 0),
        interestRate: Number(houseForm.mortgageInterestRate || 0),
        rateType: houseForm.mortgageRateType,
        repaymentType: houseForm.mortgageRepaymentType,
        fixedEndDate: houseForm.mortgageFixedEndDate || null,
        followOnRate: Number(houseForm.mortgageFollowOnRate || 0),
        monthlyPayment: Number(houseForm.mortgageMonthlyPayment || 0),
        paymentDay: Number(houseForm.mortgagePaymentDay || 1),
        plannedMonthlyOverpayment: Number(houseForm.mortgagePlannedMonthlyOverpayment || 0),
        overpaymentAllowancePercent: Number(houseForm.mortgageOverpaymentAllowancePercent || 0),
        earlyRepaymentChargeApplies: Boolean(houseForm.mortgageEarlyRepaymentChargeApplies),
        linkedAccountId: houseForm.linkedAccountId || null,
        notes: houseForm.mortgageNotes.trim()
      },
      createdAt: editingHouse?.createdAt || now,
      updatedAt: now
    });

    actions.updateAppData(prev => ({
      ...prev,
      houses: editingHouse
        ? (prev.houses || []).map(house => house.id === editingHouse.id ? housePayload : house)
        : [housePayload, ...(prev.houses || [])]
    }), { reason: editingHouse ? "House updated" : "House added" });
    setSelectedHouseId(housePayload.id);
    closeHouseModal();
  }

  function archiveHouse(house) {
    if (!window.confirm(`Archive ${house.name}? Contributions stay in history and linked transactions are not deleted.`)) return;
    const now = new Date().toISOString();
    actions.updateAppData(prev => ({
      ...prev,
      houses: (prev.houses || []).map(item => item.id === house.id
        ? { ...item, status: "archived", archived: true, archivedAt: now, updatedAt: now }
        : item
      )
    }), { reason: "House archived" });
  }

  function restoreHouse(house) {
    const now = new Date().toISOString();
    actions.updateAppData(prev => ({
      ...prev,
      houses: (prev.houses || []).map(item => item.id === house.id
        ? { ...item, status: "active", archived: false, archivedAt: null, updatedAt: now }
        : item
      )
    }), { reason: "House restored" });
    setSelectedHouseId(house.id);
  }

  function openContributionModal(house, contribution = null) {
    setContributionHouse(house);
    setEditingContribution(contribution);
    setContributionForm(contribution ? {
      personId: contribution.personId || "",
      personName: contribution.personName || "",
      amount: String(contribution.amount ?? ""),
      date: contribution.date || todayIsoDate(),
      type: contribution.type || "deposit",
      sourceType: contribution.sourceType || "external",
      linkedTransactionId: contribution.linkedTransactionId || "",
      notes: contribution.notes || ""
    } : { ...blankContributionForm, date: todayIsoDate() });
  }

  function updateContributionForm(field, value) {
    setContributionForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === "personId") {
        const person = (displayAppData.housePeople || []).find(item => item.id === value);
        next.personName = person?.name || "";
      }
      if (field === "sourceType" && contributionHouse?.isSharedHouse && value === "linkedTransaction") {
        next.sourceType = "external";
        next.linkedTransactionId = "";
      }
      return next;
    });
  }

  async function submitContribution(event) {
    event.preventDefault();
    if (!contributionHouse) return;
    setContributionFormError("");
    if (!contributionValidation.validateAll(contributionForm)) return;
    const amount = Number(contributionForm.amount || 0);
    const now = new Date().toISOString();
    const person = (displayAppData.housePeople || []).find(item => item.id === contributionForm.personId);
    const contributionId = editingContribution?.id || createId("house_contribution");
    const contribution = {
      ...(editingContribution || {}),
      id: contributionId,
      houseId: contributionHouse.id,
      personId: contributionForm.personId || null,
      personName: person?.name || contributionForm.personName.trim() || "Unassigned",
      amount,
      date: contributionForm.date || todayIsoDate(),
      type: contributionForm.type,
      sourceType: contributionForm.sourceType,
      linkedTransactionId: contributionForm.sourceType === "linkedTransaction" ? contributionForm.linkedTransactionId || null : null,
      notes: contributionForm.notes.trim(),
      createdBy: null,
      createdAt: editingContribution?.createdAt || now,
      updatedAt: now
    };

    if (contributionHouse.isSharedHouse) {
      if (editingContribution) {
        return setContributionFormError("Contributions on a shared house can't be edited yet. Add a new contribution with the corrected amount instead.");
      }
      if (contributionHouse.sharedRole === "viewer") {
        return setContributionFormError("You have view-only access to this shared house, so you can't add contributions. Ask the owner to make you an editor.");
      }
      setSharingBusy("contribution");
      try {
        await addSharedHouseContribution(appData.settings || {}, contributionHouse.id, {
          ...contribution,
          sourceType: contribution.sourceType === "manualAdjustment" ? "manualAdjustment" : "external",
          linkedTransactionId: null
        });
        await refreshSharedHouses("Shared contribution added.");
        setContributionHouse(null);
        setEditingContribution(null);
        setContributionForm(blankContributionForm);
      } catch (error) {
        setSharingStatus(isHouseSharingSetupMissing(error?.message)
          ? "House sharing SQL setup has not been run yet."
          : getErrorMessage(error, "Couldn't add shared contribution. Try again in a moment."));
      } finally {
        setSharingBusy("");
      }
      return;
    }

    actions.updateAppData(prev => ({
      ...prev,
      transactions: (prev.transactions || []).map(transaction => {
        const shouldClearPrevious = editingContribution?.linkedTransactionId
          && editingContribution.linkedTransactionId !== contribution.linkedTransactionId
          && transaction.id === editingContribution.linkedTransactionId;
        if (shouldClearPrevious) {
          return {
            ...transaction,
            linkedHouseId: null,
            linkedHouseContributionId: null,
            houseContributionType: null,
            housePersonId: null,
            housePersonName: "",
            houseContributionNotes: "",
            updatedAt: now
          };
        }
        if (contribution.linkedTransactionId && transaction.id === contribution.linkedTransactionId) {
          return {
            ...transaction,
            linkedHouseId: contributionHouse.id,
            linkedHouseContributionId: contributionId,
            houseContributionType: contribution.type,
            housePersonId: contribution.personId,
            housePersonName: contribution.personName,
            houseContributionNotes: contribution.notes,
            updatedAt: now
          };
        }
        return transaction;
      }),
      houseContributions: [
        ...(prev.houseContributions || []).filter(item => (
          item.id !== contributionId
          && (!contribution.linkedTransactionId || item.linkedTransactionId !== contribution.linkedTransactionId)
        )),
        contribution
      ]
    }), { reason: editingContribution ? "House contribution updated" : "House contribution added" });
    setContributionHouse(null);
    setEditingContribution(null);
    setContributionForm(blankContributionForm);
  }

  function deleteContribution(contribution) {
    const message = contribution.linkedTransactionId
      ? "Delete this house contribution? The linked transaction will stay in the app, but its house link will be cleared."
      : "Delete this house contribution? This does not affect account balances.";
    if (!window.confirm(message)) return;
    actions.updateAppData(prev => ({
      ...prev,
      transactions: contribution.linkedTransactionId
        ? (prev.transactions || []).map(transaction => transaction.id === contribution.linkedTransactionId
          ? {
              ...transaction,
              linkedHouseId: null,
              linkedHouseContributionId: null,
              houseContributionType: null,
              housePersonId: null,
              housePersonName: "",
              houseContributionNotes: "",
              updatedAt: new Date().toISOString()
            }
          : transaction
        )
        : prev.transactions,
      houseContributions: (prev.houseContributions || []).filter(item => item.id !== contribution.id)
    }), { reason: "House contribution deleted" });
  }

  function openPersonModal(house) {
    setPersonHouse(house);
    setPersonForm(blankPersonForm);
  }

  function updatePersonForm(field, value) {
    setPersonForm(prev => ({ ...prev, [field]: value }));
  }

  function submitPerson(event) {
    event.preventDefault();
    if (!personHouse) return;
    if (!personValidation.validateAll(personForm)) return;
    const name = personForm.name.trim();
    const now = new Date().toISOString();
    const personId = createId("house_person");
    const percentage = Number(personForm.ownershipPercentage || 0);
    const person = {
      id: personId,
      houseId: personHouse.id,
      name,
      email: personForm.email.trim() || null,
      label: personForm.label.trim(),
      createdAt: now,
      updatedAt: now
    };
    const split = percentage > 0 ? [{
      id: createId("house_split"),
      houseId: personHouse.id,
      personId,
      percentage,
      createdAt: now,
      updatedAt: now
    }] : [];

    actions.updateAppData(prev => ({
      ...prev,
      housePeople: [person, ...(prev.housePeople || [])],
      houseOwnershipSplits: [...split, ...(prev.houseOwnershipSplits || [])]
    }), { reason: "House person added" });
    setPersonHouse(null);
    setPersonForm(blankPersonForm);
  }

  return {
    archiveHouse,
    closeHouseModal,
    contributionForm,
    contributionFormError,
    contributionHouse,
    contributionValidation,
    deleteContribution,
    editingContribution,
    editingHouse,
    houseForm,
    houseValidation,
    openAddHouseModal,
    openContributionModal,
    openEditHouseModal,
    openPersonModal,
    personForm,
    personHouse,
    personValidation,
    restoreHouse,
    setContributionHouse,
    setEditingContribution,
    setPersonHouse,
    showHouseModal,
    submitContribution,
    submitHouse,
    submitPerson,
    updateContributionForm,
    updateHouseForm,
    updatePersonForm
  };
}
