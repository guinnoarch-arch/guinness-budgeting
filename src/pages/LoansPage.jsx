import { useEffect, useMemo, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { studentLoanPlanOptions, getStudentLoanPlan } from "../data/studentLoanPlans.js";
import {
  calculateLoanEstimate,
  calculateLoanSummary,
  getProjectedDateFromMonths
} from "../utils/loanCalculations.js";
import { createId } from "../utils/ids.js";
import { addMonthsToIsoDate, formatIsoDateLocal, parseIsoDateLocal, todayIsoDate } from "../utils/dates.js";
import {
  HOUSE_CONTRIBUTION_TYPES,
  HOUSE_OWNERSHIP_MODES,
  HOUSE_SOURCE_TYPES,
  calculateHouseSummary,
  calculateHousesSummary,
  normaliseHouseRecord
} from "../utils/houseTracking.js";
import { formatMoney } from "../utils/money.js";
import {
  acceptHouseInvite,
  addSharedHouseContribution,
  cancelHouseInvite,
  declineHouseInvite,
  inviteHouseMember,
  isHouseSharingSetupMissing,
  listSharedHouseBundles,
  removeHouseMember,
  updateHouseMemberRole,
  upsertSharedHouseSnapshot
} from "../services/houseSharingService.js";
import {
  getLoanTimelineEvents,
  getLoanValidationWarnings,
  getMortgageOverpaymentSummary
} from "../utils/loanLinking.js";
import "../styles/loans.css";

const today = () => todayIsoDate();

const blankHouseForm = {
  name: "",
  addressLabel: "",
  purchasePrice: "",
  purchaseDate: "",
  propertyValue: "",
  notes: "",
  ownershipMode: "contributionTracking",
  mortgageOriginalAmount: "",
  mortgageCurrentBalance: "",
  mortgageStartDate: "",
  mortgageTermYears: "",
  mortgageInterestRate: "",
  mortgageRateType: "fixed",
  mortgageFixedEndDate: "",
  mortgageMonthlyPayment: "",
  linkedAccountId: ""
};

const blankContributionForm = {
  personId: "",
  personName: "",
  amount: "",
  date: today(),
  type: "deposit",
  sourceType: "external",
  linkedTransactionId: "",
  notes: ""
};

const blankPersonForm = {
  name: "",
  email: "",
  label: "",
  ownershipPercentage: ""
};

const blankLoanForm = {
  type: "studentLoan",
  name: "",
  originalAmount: "",
  currentBalance: "",
  balanceDate: today(),
  startDate: "",
  notes: "",

  planType: "plan2",
  repaymentStartDate: "",
  grossAnnualSalary: "",
  payFrequency: "monthly",
  employmentType: "PAYE",
  salaryGrowthPercent: "",
  manualAnnualInterestRate: "",

  repaymentType: "repayment",
  termYears: "25",
  remainingTermMonths: "",
  monthlyPayment: "",
  paymentDay: "1",
  interestType: "fixed",
  currentRate: "",
  fixedUntil: "",
  followOnRate: "",
  plannedMonthlyOverpayment: "0",
  overpaymentAllowancePercent: "10",
  earlyRepaymentChargeApplies: false,
  propertyValue: ""
};

function buildSharedHouseData(bundles = []) {
  return bundles.reduce((acc, bundle) => {
    const houseId = bundle.house_id || bundle.house?.id;
    if (!houseId) return acc;
    const house = {
      ...normaliseHouseRecord({
      ...(bundle.house || {}),
      id: houseId
      }),
      sharedRole: bundle.role || "viewer",
      isSharedHouse: true
    };
    acc.houses.push(house);
    acc.housePeople.push(...(Array.isArray(bundle.people) ? bundle.people : []).map(item => ({ ...item, houseId })));
    acc.houseContributions.push(...(Array.isArray(bundle.contributions) ? bundle.contributions : []).map(item => ({ ...item, houseId })));
    acc.houseOwnershipSplits.push(...(Array.isArray(bundle.ownership_splits) ? bundle.ownership_splits : []).map(item => ({ ...item, houseId })));
    acc.houseMembers.push(...(Array.isArray(bundle.members) ? bundle.members : []).map(item => ({ ...item, houseId })));
    acc.houseInvites.push(...(Array.isArray(bundle.invites) ? bundle.invites : []).map(item => ({ ...item, houseId })));
    return acc;
  }, {
    houses: [],
    housePeople: [],
    houseContributions: [],
    houseOwnershipSplits: [],
    houseMembers: [],
    houseInvites: []
  });
}

function mergeHouseDisplayData(appData, sharedData) {
  const sharedById = new Map((sharedData.houses || []).map(house => [house.id, house]));
  const localHouses = (appData.houses || []).map(house => {
    const shared = sharedById.get(house.id);
    return shared ? { ...house, sharedRole: shared.sharedRole, isSharedHouse: false } : house;
  });
  const localIds = new Set(localHouses.map(house => house.id));
  const remoteOnlyHouses = (sharedData.houses || []).filter(house => !localIds.has(house.id));

  return {
    ...appData,
    houses: [...localHouses, ...remoteOnlyHouses],
    housePeople: [
      ...(appData.housePeople || []),
      ...(sharedData.housePeople || []).filter(item => !localIds.has(item.houseId))
    ],
    houseContributions: [
      ...(appData.houseContributions || []),
      ...(sharedData.houseContributions || []).filter(item => !localIds.has(item.houseId))
    ],
    houseOwnershipSplits: [
      ...(appData.houseOwnershipSplits || []),
      ...(sharedData.houseOwnershipSplits || []).filter(item => !localIds.has(item.houseId))
    ],
    houseMembers: [
      ...(appData.houseMembers || []),
      ...(sharedData.houseMembers || [])
    ],
    houseInvites: [
      ...(appData.houseInvites || []),
      ...(sharedData.houseInvites || [])
    ]
  };
}

export default function LoansPage({ appData, actions }) {
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [loanForm, setLoanForm] = useState(blankLoanForm);
  const [balanceUpdateLoan, setBalanceUpdateLoan] = useState(null);
  const [balanceUpdate, setBalanceUpdate] = useState({ balance: "", date: today(), note: "" });
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [selectedHouseId, setSelectedHouseId] = useState(null);
  const [showHouseModal, setShowHouseModal] = useState(false);
  const [editingHouse, setEditingHouse] = useState(null);
  const [houseForm, setHouseForm] = useState(blankHouseForm);
  const [contributionHouse, setContributionHouse] = useState(null);
  const [editingContribution, setEditingContribution] = useState(null);
  const [contributionForm, setContributionForm] = useState(blankContributionForm);
  const [personHouse, setPersonHouse] = useState(null);
  const [personForm, setPersonForm] = useState(blankPersonForm);
  const [sharedBundles, setSharedBundles] = useState([]);
  const [sharingStatus, setSharingStatus] = useState("");
  const [sharingBusy, setSharingBusy] = useState("");

  async function refreshSharedHouses(statusMessage = "") {
    try {
      const bundles = await listSharedHouseBundles(appData.settings || {});
      setSharedBundles(bundles);
      setSharingStatus(statusMessage);
    } catch (error) {
      setSharedBundles([]);
      setSharingStatus(isHouseSharingSetupMissing(error?.message)
        ? "House sharing SQL setup has not been run yet."
        : error?.message || "Could not load shared houses.");
    }
  }

  useEffect(() => {
    refreshSharedHouses();
  }, [appData.settings?.cloudBackup?.enabled, appData.settings?.cloudBackup?.cloudUserId, appData.settings?.cloudBackup?.lastSignedInAt]);

  const sharedHouseData = useMemo(() => buildSharedHouseData(sharedBundles), [sharedBundles]);
  const displayAppData = useMemo(() => mergeHouseDisplayData(appData, sharedHouseData), [appData, sharedHouseData]);
  const summary = useMemo(() => calculateLoanSummary(appData), [appData]);
  const houseSummary = useMemo(() => calculateHousesSummary(displayAppData), [displayAppData]);
  const loanEvents = Array.isArray(appData.loanEvents) ? appData.loanEvents : [];
  const activeLoans = summary.loans;
  const selectedLoan = activeLoans.find(loan => loan.id === selectedLoanId) || null;
  const selectedHouse = houseSummary.houses.find(house => house.id === selectedHouseId) || houseSummary.activeHouses[0] || null;

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
      notes: house.notes || "",
      ownershipMode: house.ownershipMode || "contributionTracking",
      mortgageOriginalAmount: String(house.mortgage?.originalAmount ?? ""),
      mortgageCurrentBalance: String(house.mortgage?.currentBalance ?? ""),
      mortgageStartDate: house.mortgage?.startDate || "",
      mortgageTermYears: String(house.mortgage?.termYears ?? ""),
      mortgageInterestRate: String(house.mortgage?.interestRate ?? ""),
      mortgageRateType: house.mortgage?.rateType || "fixed",
      mortgageFixedEndDate: house.mortgage?.fixedEndDate || "",
      mortgageMonthlyPayment: String(house.mortgage?.monthlyPayment ?? ""),
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
    const name = houseForm.name.trim();
    if (!name) return alert("Enter a house name.");
    const now = new Date().toISOString();
    const housePayload = normaliseHouseRecord({
      ...(editingHouse || {}),
      id: editingHouse?.id || createId("house"),
      name,
      addressLabel: houseForm.addressLabel.trim(),
      purchasePrice: Number(houseForm.purchasePrice || 0),
      purchaseDate: houseForm.purchaseDate || null,
      propertyValue: Number(houseForm.propertyValue || 0),
      notes: houseForm.notes.trim(),
      ownershipMode: houseForm.ownershipMode,
      status: editingHouse?.status || "active",
      archived: editingHouse?.archived || false,
      mortgage: {
        originalAmount: Number(houseForm.mortgageOriginalAmount || 0),
        currentBalance: Number(houseForm.mortgageCurrentBalance || 0),
        startDate: houseForm.mortgageStartDate || null,
        termYears: Number(houseForm.mortgageTermYears || 0),
        interestRate: Number(houseForm.mortgageInterestRate || 0),
        rateType: houseForm.mortgageRateType,
        fixedEndDate: houseForm.mortgageFixedEndDate || null,
        monthlyPayment: Number(houseForm.mortgageMonthlyPayment || 0),
        linkedAccountId: houseForm.linkedAccountId || null
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
      date: contribution.date || today(),
      type: contribution.type || "deposit",
      sourceType: contribution.sourceType || "external",
      linkedTransactionId: contribution.linkedTransactionId || "",
      notes: contribution.notes || ""
    } : { ...blankContributionForm, date: today() });
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
    const amount = Number(contributionForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return alert("Enter a contribution amount above zero.");
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
      date: contributionForm.date || today(),
      type: contributionForm.type,
      sourceType: contributionForm.sourceType,
      linkedTransactionId: contributionForm.sourceType === "linkedTransaction" ? contributionForm.linkedTransactionId || null : null,
      notes: contributionForm.notes.trim(),
      createdBy: null,
      createdAt: editingContribution?.createdAt || now,
      updatedAt: now
    };

    if (contributionHouse.isSharedHouse) {
      if (editingContribution) return alert("Shared contribution editing is limited to newly added safe contributions.");
      if (contributionHouse.sharedRole === "viewer") return alert("Viewers cannot add house contributions.");
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
          : error?.message || "Could not add shared contribution.");
      } finally {
        setSharingBusy("");
      }
      return;
    }

    if (contribution.sourceType === "linkedTransaction" && !contribution.linkedTransactionId) {
      return alert("Choose the transaction this contribution links to.");
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
    const name = personForm.name.trim();
    if (!name) return alert("Enter a person name.");
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

  async function publishHouseForSharing(house) {
    setSharingBusy("publish");
    try {
      await upsertSharedHouseSnapshot(appData.settings || {}, appData, house);
      await refreshSharedHouses("House sharing snapshot is up to date.");
    } catch (error) {
      setSharingStatus(isHouseSharingSetupMissing(error?.message)
        ? "House sharing SQL setup has not been run yet."
        : error?.message || "Could not publish house for sharing.");
    } finally {
      setSharingBusy("");
    }
  }

  async function sendHouseInvite(house, identifier, role) {
    const trimmed = String(identifier || "").trim();
    if (!trimmed) {
      setSharingStatus("Enter an email address or username to invite.");
      return;
    }
    setSharingBusy("invite");
    try {
      await upsertSharedHouseSnapshot(appData.settings || {}, appData, house);
      await inviteHouseMember(appData.settings || {}, house.id, trimmed, role || "viewer");
      await refreshSharedHouses("House invite updated.");
    } catch (error) {
      setSharingStatus(isHouseSharingSetupMissing(error?.message)
        ? "House sharing SQL setup has not been run yet."
        : error?.message || "Could not send house invite.");
    } finally {
      setSharingBusy("");
    }
  }

  async function acceptInvite(invite) {
    setSharingBusy(`accept-${invite.id}`);
    try {
      await acceptHouseInvite(appData.settings || {}, invite.id);
      await refreshSharedHouses("House invite accepted.");
    } catch (error) {
      setSharingStatus(error?.message || "Could not accept house invite.");
    } finally {
      setSharingBusy("");
    }
  }

  async function declineInvite(invite) {
    setSharingBusy(`decline-${invite.id}`);
    try {
      await declineHouseInvite(appData.settings || {}, invite.id);
      await refreshSharedHouses("House invite declined.");
    } catch (error) {
      setSharingStatus(error?.message || "Could not decline house invite.");
    } finally {
      setSharingBusy("");
    }
  }

  async function cancelInvite(house, invite) {
    setSharingBusy(`cancel-${invite.id}`);
    try {
      await cancelHouseInvite(appData.settings || {}, house.id, invite.id);
      await refreshSharedHouses("House invite cancelled.");
    } catch (error) {
      setSharingStatus(error?.message || "Could not cancel house invite.");
    } finally {
      setSharingBusy("");
    }
  }

  async function changeMemberRole(house, member, role) {
    setSharingBusy(`role-${member.userId}`);
    try {
      await updateHouseMemberRole(appData.settings || {}, house.id, member.userId, role);
      await refreshSharedHouses("House member role updated.");
    } catch (error) {
      setSharingStatus(error?.message || "Could not update member role.");
    } finally {
      setSharingBusy("");
    }
  }

  async function removeMember(house, member) {
    if (!window.confirm(`Remove ${member.username || member.email || "this user"} from this house?`)) return;
    setSharingBusy(`remove-${member.userId}`);
    try {
      await removeHouseMember(appData.settings || {}, house.id, member.userId);
      await refreshSharedHouses("House member removed.");
    } catch (error) {
      setSharingStatus(error?.message || "Could not remove member.");
    } finally {
      setSharingBusy("");
    }
  }

  function updateLoanForm(field, value) {
    setLoanForm(prev => ({ ...prev, [field]: value }));
  }

  function openAddLoanModal(type = "studentLoan") {
    const defaultPlan = type === "studentLoan" ? "plan2" : blankLoanForm.planType;
    setEditingLoan(null);
    setLoanForm({
      ...blankLoanForm,
      type,
      planType: defaultPlan,
      name: type === "mortgage" ? "Mortgage" : "Student loan"
    });
    setShowLoanModal(true);
  }

  function openEditLoanModal(loan) {
    setEditingLoan(loan);
    const studentDetails = loan.studentLoanDetails || {};
    const mortgageDetails = loan.mortgageDetails || {};

    setLoanForm({
      ...blankLoanForm,
      type: loan.type || "studentLoan",
      name: loan.name || "",
      originalAmount: String(loan.originalAmount ?? ""),
      currentBalance: String(loan.currentBalance ?? ""),
      balanceDate: loan.balanceDate || today(),
      startDate: loan.startDate || "",
      notes: loan.notes || "",

      planType: studentDetails.planType || "plan2",
      repaymentStartDate: studentDetails.repaymentStartDate || "",
      grossAnnualSalary: String(studentDetails.grossAnnualSalary ?? ""),
      payFrequency: studentDetails.payFrequency || "monthly",
      employmentType: studentDetails.employmentType || "PAYE",
      salaryGrowthPercent: String(studentDetails.salaryGrowthPercent ?? ""),
      manualAnnualInterestRate: String(studentDetails.manualAnnualInterestRate ?? ""),

      repaymentType: mortgageDetails.repaymentType || "repayment",
      termYears: String(mortgageDetails.termYears ?? "25"),
      remainingTermMonths: String(mortgageDetails.remainingTermMonths ?? ""),
      monthlyPayment: String(mortgageDetails.monthlyPayment ?? ""),
      paymentDay: String(mortgageDetails.paymentDay ?? "1"),
      interestType: mortgageDetails.interestType || "fixed",
      currentRate: String(mortgageDetails.currentRate ?? ""),
      fixedUntil: mortgageDetails.fixedUntil || "",
      followOnRate: String(mortgageDetails.followOnRate ?? ""),
      plannedMonthlyOverpayment: String(mortgageDetails.plannedMonthlyOverpayment ?? "0"),
      overpaymentAllowancePercent: String(mortgageDetails.overpaymentAllowancePercent ?? "10"),
      earlyRepaymentChargeApplies: Boolean(mortgageDetails.earlyRepaymentChargeApplies),
      propertyValue: String(mortgageDetails.propertyValue ?? "")
    });
    setShowLoanModal(true);
  }

  function closeLoanModal() {
    setShowLoanModal(false);
    setEditingLoan(null);
    setLoanForm(blankLoanForm);
  }

  function submitLoan(event) {
    event.preventDefault();

    const name = loanForm.name.trim();
    const currentBalance = Number(loanForm.currentBalance || 0);
    const originalAmount = Number(loanForm.originalAmount || 0);
    const now = new Date().toISOString();

    if (!name) return alert("Enter a loan name.");
    if (!Number.isFinite(currentBalance) || currentBalance < 0) return alert("Enter a valid current balance.");

    const loanPayload = {
      id: editingLoan?.id || createId("loan"),
      type: loanForm.type,
      name,
      originalAmount: Number.isFinite(originalAmount) ? originalAmount : 0,
      currentBalance,
      balanceDate: loanForm.balanceDate || today(),
      startDate: loanForm.startDate || null,
      status: editingLoan?.status || "active",
      notes: loanForm.notes.trim(),
      isExample: editingLoan?.isExample || false,
      createdAt: editingLoan?.createdAt || now,
      updatedAt: now,
      studentLoanDetails: loanForm.type === "studentLoan" ? {
        planType: loanForm.planType,
        repaymentStartDate: loanForm.repaymentStartDate || null,
        grossAnnualSalary: Number(loanForm.grossAnnualSalary || 0),
        payFrequency: loanForm.payFrequency,
        employmentType: loanForm.employmentType,
        salaryGrowthPercent: Number(loanForm.salaryGrowthPercent || 0),
        manualAnnualInterestRate: loanForm.manualAnnualInterestRate === "" ? null : Number(loanForm.manualAnnualInterestRate)
      } : null,
      mortgageDetails: loanForm.type === "mortgage" ? {
        repaymentType: loanForm.repaymentType,
        termYears: Number(loanForm.termYears || 0),
        remainingTermMonths: Number(loanForm.remainingTermMonths || 0),
        monthlyPayment: Number(loanForm.monthlyPayment || 0),
        paymentDay: Number(loanForm.paymentDay || 1),
        interestType: loanForm.interestType,
        currentRate: Number(loanForm.currentRate || 0),
        fixedUntil: loanForm.fixedUntil || null,
        followOnRate: Number(loanForm.followOnRate || 0),
        plannedMonthlyOverpayment: Number(loanForm.plannedMonthlyOverpayment || 0),
        overpaymentAllowancePercent: Number(loanForm.overpaymentAllowancePercent || 0),
        earlyRepaymentChargeApplies: Boolean(loanForm.earlyRepaymentChargeApplies),
        propertyValue: Number(loanForm.propertyValue || 0)
      } : null
    };

    actions.updateAppData(prev => ({
      ...prev,
      loans: editingLoan
        ? (prev.loans || []).map(loan => loan.id === editingLoan.id ? loanPayload : loan)
        : [...(prev.loans || []), loanPayload]
    }));

    setSelectedLoanId(loanPayload.id);
    closeLoanModal();
  }

  function archiveLoan(loan) {
    const confirmed = window.confirm(`Archive ${loan.name}? It will be hidden from active loan totals but kept in history.`);
    if (!confirmed) return;

    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).map(existing => existing.id === loan.id
        ? { ...existing, status: "archived", archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : existing
      )
    }));
    setSelectedLoanId(null);
  }

  function restoreLoan(loan) {
    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).map(existing => existing.id === loan.id
        ? { ...existing, status: "active", archivedAt: null, updatedAt: new Date().toISOString() }
        : existing
      )
    }));
    setSelectedLoanId(loan.id);
  }

  function deleteLoan(loan) {
    const confirmed = window.confirm(`Permanently delete ${loan.name}? This removes the loan and its loan-event history.`);
    if (!confirmed) return;

    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).filter(existing => existing.id !== loan.id),
      loanEvents: (prev.loanEvents || []).filter(event => event.loanId !== loan.id)
    }));
  }

  function openBalanceUpdate(loan) {
    setBalanceUpdateLoan(loan);
    setBalanceUpdate({ balance: String(loan.currentBalance ?? ""), date: today(), note: "Manual balance update" });
  }

  function submitBalanceUpdate(event) {
    event.preventDefault();
    if (!balanceUpdateLoan) return;

    const newBalance = Number(balanceUpdate.balance);
    if (!Number.isFinite(newBalance) || newBalance < 0) return alert("Enter a valid balance.");

    const oldBalance = Number(balanceUpdateLoan.currentBalance || 0);
    const now = new Date().toISOString();
    const eventPayload = {
      id: createId("loan_event"),
      loanId: balanceUpdateLoan.id,
      date: balanceUpdate.date || today(),
      type: "balanceAdjustment",
      amount: newBalance - oldBalance,
      previousBalance: oldBalance,
      newBalance,
      note: balanceUpdate.note || "Manual balance update",
      createdAt: now
    };

    actions.updateAppData(prev => ({
      ...prev,
      loans: (prev.loans || []).map(loan => loan.id === balanceUpdateLoan.id
        ? { ...loan, currentBalance: newBalance, balanceDate: eventPayload.date, updatedAt: now }
        : loan
      ),
      loanEvents: [...(prev.loanEvents || []), eventPayload]
    }));

    setSelectedLoanId(balanceUpdateLoan.id);
    setBalanceUpdateLoan(null);
    setBalanceUpdate({ balance: "", date: today(), note: "" });
  }

  const archivedLoans = (appData.loans || []).filter(loan => loan.status === "archived");

  return (
    <div className="page-grid loans-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Loans</p>
          <h2>Loans tracker</h2>
          <p className="muted">Open a tile only when you want the details. The default view keeps the debt information calm and simple.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="primary-button" onClick={openAddHouseModal}>+ House</button>
          <button type="button" className="secondary-button" onClick={() => openAddLoanModal("studentLoan")}>+ Student loan</button>
          <button type="button" className="primary-button" onClick={() => openAddLoanModal("mortgage")}>+ Mortgage</button>
        </div>
      </div>

      <HouseSection
        appData={displayAppData}
        houseSummary={houseSummary}
        selectedHouse={selectedHouse}
        setSelectedHouseId={setSelectedHouseId}
        onAddHouse={openAddHouseModal}
        onEditHouse={openEditHouseModal}
        onArchiveHouse={archiveHouse}
        onRestoreHouse={restoreHouse}
        onAddContribution={openContributionModal}
        onEditContribution={openContributionModal}
        onDeleteContribution={deleteContribution}
        onAddPerson={openPersonModal}
        sharingStatus={sharingStatus}
        sharingBusy={sharingBusy}
        onRefreshSharedHouses={refreshSharedHouses}
        onPublishHouse={publishHouseForSharing}
        onInviteHouse={sendHouseInvite}
        onAcceptInvite={acceptInvite}
        onDeclineInvite={declineInvite}
        onCancelInvite={cancelInvite}
        onChangeMemberRole={changeMemberRole}
        onRemoveMember={removeMember}
      />

      {activeLoans.length === 0 ? (
        <section className="card empty-state-card">
          <h3>No loans yet</h3>
          <p className="muted">Add a student loan or mortgage to start tracking balance, interest, repayments and projections.</p>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => openAddLoanModal("studentLoan")}>Add student loan</button>
            <button type="button" className="primary-button" onClick={() => openAddLoanModal("mortgage")}>Add mortgage</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card loan-tile-section">
            <div className="section-header compact-header">
              <div>
                <h3>Your loans</h3>
                <p className="muted">Click a tile to open the balance, projection and extra details.</p>
              </div>
              <strong>{formatMoney(summary.totalDebt, false)} total tracked</strong>
            </div>

            <div className="loan-tile-grid">
              {activeLoans.map((loan, index) => (
                <LoanTile
                  key={loan.id}
                  loan={loan}
                  index={index}
                  selected={loan.id === selectedLoanId}
                  onSelect={() => setSelectedLoanId(loan.id === selectedLoanId ? null : loan.id)}
                />
              ))}
            </div>
          </section>

          {selectedLoan ? (
            <LoanDetailPanel
              loan={selectedLoan}
              events={loanEvents.filter(event => event.loanId === selectedLoan.id)}
              onEdit={() => openEditLoanModal(selectedLoan)}
              onArchive={() => archiveLoan(selectedLoan)}
              onBalanceUpdate={() => openBalanceUpdate(selectedLoan)}
              onClose={() => setSelectedLoanId(null)}
              transactions={appData.transactions || []}
              appData={appData}
            />
          ) : (
            <section className="card loan-closed-state-card">
              <h3>No loan opened</h3>
              <p className="muted">This page only shows the simple loan tiles until you choose one. That keeps the mortgage/student-loan detail out of view by default.</p>
            </section>
          )}
        </>
      )}

      <section className="card archived-budget-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived loans</h3>
            <p className="muted-text">Archived loans stay out of active totals. You can restore or permanently remove them.</p>
          </div>
        </div>

        {archivedLoans.length === 0 ? (
          <p className="muted">No archived loans yet.</p>
        ) : (
          <div className="archive-list">
            {archivedLoans.map(loan => (
              <div key={loan.id} className="archive-row">
                <div>
                  <strong>{loan.name}</strong>
                  <small>{loan.type === "mortgage" ? "Mortgage" : "Student loan"} · archived {loan.archivedAt ? loan.archivedAt.slice(0, 10) : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <strong>{formatMoney(loan.currentBalance)}</strong>
                  <button type="button" className="secondary-button" onClick={() => restoreLoan(loan)}>Restore</button>
                  <button type="button" className="danger-button" onClick={() => deleteLoan(loan)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showLoanModal && (
        <LoanModal
          loanForm={loanForm}
          editingLoan={editingLoan}
          updateLoanForm={updateLoanForm}
          closeLoanModal={closeLoanModal}
          submitLoan={submitLoan}
        />
      )}

      {showHouseModal && (
        <HouseModal
          houseForm={houseForm}
          editingHouse={editingHouse}
          accounts={appData.accounts || []}
          updateHouseForm={updateHouseForm}
          closeHouseModal={closeHouseModal}
          submitHouse={submitHouse}
        />
      )}

      {contributionHouse && (
        <HouseContributionModal
          house={contributionHouse}
          appData={displayAppData}
          contributionForm={contributionForm}
          updateContributionForm={updateContributionForm}
          submitContribution={submitContribution}
          editingContribution={editingContribution}
          closeContributionModal={() => { setContributionHouse(null); setEditingContribution(null); }}
        />
      )}

      {personHouse && (
        <HousePersonModal
          house={personHouse}
          personForm={personForm}
          updatePersonForm={updatePersonForm}
          submitPerson={submitPerson}
          closePersonModal={() => setPersonHouse(null)}
        />
      )}

      {balanceUpdateLoan && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitBalanceUpdate}>
            <div className="section-header">
              <h2>Update balance: {balanceUpdateLoan.name}</h2>
              <button type="button" className="icon-button" onClick={() => setBalanceUpdateLoan(null)}>×</button>
            </div>

            <div className="form-grid">
              <label>
                New balance
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={balanceUpdate.balance}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, balance: event.target.value }))}
                />
              </label>
              <label>
                Balance date
                <input
                  type="date"
                  value={balanceUpdate.date}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, date: event.target.value }))}
                />
              </label>
              <label className="full-width">
                Note
                <input
                  value={balanceUpdate.note}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, note: event.target.value }))}
                  placeholder="Statement balance update"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setBalanceUpdateLoan(null)}>Cancel</button>
              <button className="primary-button">Save balance update</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function HouseSection({
  appData,
  houseSummary,
  selectedHouse,
  setSelectedHouseId,
  onAddHouse,
  onEditHouse,
  onArchiveHouse,
  onRestoreHouse,
  onAddContribution,
  onEditContribution,
  onDeleteContribution,
  onAddPerson,
  sharingStatus,
  sharingBusy,
  onRefreshSharedHouses,
  onPublishHouse,
  onInviteHouse,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onChangeMemberRole,
  onRemoveMember
}) {
  const archivedHouses = houseSummary.houses.filter(house => house.status === "archived" || house.archived);
  const selectedSummary = selectedHouse ? calculateHouseSummary(appData, selectedHouse) : null;

  return (
    <section className="card house-section">
      <div className="section-header compact-header">
        <div>
          <p className="eyebrow">House</p>
          <h3>House, mortgage and contributions</h3>
          <p className="muted">Track the property, mortgage, deposits, house costs, external contributions and linked app-account payments.</p>
        </div>
        <button type="button" className="primary-button" onClick={onAddHouse}>Add house</button>
      </div>

      <div className="loan-detail-grid">
        <div className="sub-card loan-detail-card">
          <small>Total house value</small>
          <strong>{formatMoney(houseSummary.totalHouseValue)}</strong>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Total mortgage balance</small>
          <strong>{formatMoney(houseSummary.totalMortgageBalance)}</strong>
        </div>
        <div className="sub-card loan-detail-card positive-card-soft">
          <small>Estimated equity</small>
          <strong>{formatMoney(houseSummary.totalEquity)}</strong>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Total contributed</small>
          <strong>{formatMoney(houseSummary.totalContributed)}</strong>
        </div>
      </div>

      {houseSummary.houses.length === 0 ? (
        <div className="loan-closed-state-card sub-card">
          <h4>No houses yet</h4>
          <p className="muted">Add a house to track property value, mortgage details and who paid what. Existing mortgage loans are kept and are migrated into house records when possible.</p>
        </div>
      ) : (
        <div className="house-layout-grid">
          <div className="house-list-panel">
            <h4>Houses</h4>
            <div className="loan-tile-grid">
              {houseSummary.activeHouses.map(house => {
                const summary = calculateHouseSummary(appData, house);
                return (
                  <button
                    type="button"
                    key={house.id}
                    className={`loan-summary-tile ${selectedHouse?.id === house.id ? "selected" : ""}`}
                    onClick={() => setSelectedHouseId(house.id)}
                  >
                    <span className="loan-summary-type">{house.archived ? "Archived house" : "House"}</span>
                    <strong>{house.name}</strong>
                    <span className="loan-summary-amount">{formatMoney(summary.estimatedEquity, false)}</span>
                    <small>{formatMoney(summary.mortgageBalance, false)} mortgage · {summary.people.length} people</small>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedHouse && selectedSummary && (
            <HouseDetailPanel
              house={selectedHouse}
              summary={selectedSummary}
              appData={appData}
              onEdit={() => onEditHouse(selectedHouse)}
              onArchive={() => onArchiveHouse(selectedHouse)}
              onAddContribution={() => onAddContribution(selectedHouse)}
              onEditContribution={(contribution) => onEditContribution(selectedHouse, contribution)}
              onDeleteContribution={onDeleteContribution}
              onAddPerson={() => onAddPerson(selectedHouse)}
              sharingStatus={sharingStatus}
              sharingBusy={sharingBusy}
              onRefreshSharedHouses={onRefreshSharedHouses}
              onPublishHouse={() => onPublishHouse(selectedHouse)}
              onInviteHouse={(identifier, role) => onInviteHouse(selectedHouse, identifier, role)}
              onAcceptInvite={onAcceptInvite}
              onDeclineInvite={onDeclineInvite}
              onCancelInvite={(invite) => onCancelInvite(selectedHouse, invite)}
              onChangeMemberRole={(member, role) => onChangeMemberRole(selectedHouse, member, role)}
              onRemoveMember={(member) => onRemoveMember(selectedHouse, member)}
            />
          )}
        </div>
      )}

      <details className="loan-extra-details-card">
        <summary>Archived houses</summary>
        {archivedHouses.length === 0 ? (
          <p className="muted-text">No archived houses yet.</p>
        ) : (
          <div className="archive-list">
            {archivedHouses.map(house => (
              <div key={house.id} className="archive-row">
                <div>
                  <strong>{house.name}</strong>
                  <small>Archived {house.archivedAt ? house.archivedAt.slice(0, 10) : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <button type="button" className="secondary-button" onClick={() => onRestoreHouse(house)}>Restore</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}

function HouseDetailPanel({
  house,
  summary,
  appData,
  onEdit,
  onArchive,
  onAddContribution,
  onEditContribution,
  onDeleteContribution,
  onAddPerson,
  sharingStatus,
  sharingBusy,
  onRefreshSharedHouses,
  onPublishHouse,
  onInviteHouse,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onChangeMemberRole,
  onRemoveMember
}) {
  const linkedAccount = (appData.accounts || []).find(account => account.id === house.mortgage?.linkedAccountId);
  const linkedTransactions = (appData.transactions || []).filter(transaction => transaction.linkedHouseId === house.id);
  const role = house.sharedRole || "owner";
  const isRemoteSharedHouse = Boolean(house.isSharedHouse);
  const canManageSharing = role === "owner";
  const canEditHouse = !isRemoteSharedHouse && role === "owner";
  const canAddContribution = role === "owner" || role === "editor";
  const canEditContributions = !isRemoteSharedHouse && role === "owner";
  const splitLabel = house.ownershipMode === "manualOwnership"
    ? "Manual ownership split"
    : house.ownershipMode === "contributionEstimate"
      ? "Contribution-based estimate"
      : "Contribution tracking only";

  return (
    <div className="house-detail-panel">
      <div className="section-header compact-header">
        <div>
          <h3>{house.name}</h3>
          <p className="muted">{house.addressLabel || "No address label"} · {splitLabel}</p>
        </div>
        <div className="row-actions">
          {canAddContribution && <button type="button" className="secondary-button" onClick={onAddContribution}>Add contribution</button>}
          {canEditHouse && <button type="button" className="secondary-button" onClick={onAddPerson}>Add person</button>}
          {canEditHouse && <button type="button" className="secondary-button" onClick={onEdit}>Edit house</button>}
          {canEditHouse && <button type="button" className="danger-button" onClick={onArchive}>Archive</button>}
        </div>
      </div>

      <div className="house-tab-grid">
        <section className="sub-card house-tab-card">
          <h4>Overview</h4>
          <div className="loan-detail-grid">
            <InfoMetric label="Property value" value={formatMoney(summary.propertyValue)} />
            <InfoMetric label="Mortgage balance" value={formatMoney(summary.mortgageBalance)} />
            <InfoMetric label="Estimated equity" value={formatMoney(summary.estimatedEquity)} />
            <InfoMetric label="Total contributed" value={formatMoney(summary.totalContributed)} />
          </div>
          <p className="muted-text">Contribution split is a tracking estimate only, not legal ownership.</p>
          <ContributionSplitList summary={summary} />
        </section>

        <section className="sub-card house-tab-card">
          <h4>Mortgage details</h4>
          <div className="loan-detail-grid">
            <InfoMetric label="Original mortgage" value={formatMoney(house.mortgage?.originalAmount || 0)} />
            <InfoMetric label="Monthly repayment" value={formatMoney(house.mortgage?.monthlyPayment || 0)} />
            <InfoMetric label="Rate" value={`${Number(house.mortgage?.interestRate || 0).toFixed(2)}% ${house.mortgage?.rateType || ""}`} />
            <InfoMetric label="Term" value={`${Number(house.mortgage?.termYears || 0)} years`} />
          </div>
          <p className="muted-text">Linked account: {linkedAccount?.name || "None selected"}</p>
        </section>

        <section className="sub-card house-tab-card">
          <h4>Contributions</h4>
          <div className="loan-detail-grid">
            <InfoMetric label="Deposits" value={formatMoney(summary.depositTotal)} />
            <InfoMetric label="Mortgage payments" value={formatMoney(summary.mortgagePaymentTotal)} />
            <InfoMetric label="Overpayments" value={formatMoney(summary.mortgageOverpaymentTotal)} />
            <InfoMetric label="House costs" value={formatMoney(summary.houseCostTotal)} />
            <InfoMetric label="External" value={formatMoney(summary.externalTotal)} />
            <InfoMetric label="Linked app transactions" value={formatMoney(summary.linkedTotal)} />
          </div>
          <HouseContributionTable contributions={summary.contributions} people={summary.people} onEditContribution={onEditContribution} onDeleteContribution={onDeleteContribution} canEdit={canEditContributions} />
        </section>

        <section className="sub-card house-tab-card">
          <h4>People / Splits</h4>
          {summary.people.length === 0 ? (
            <p className="muted-text">Add people to attribute deposits, mortgage payments and other house costs.</p>
          ) : (
            <div className="house-person-list">
              {summary.people.map(person => {
                const split = summary.splits.find(item => item.personId === person.id);
                const total = summary.byPerson.find(item => item.personId === person.id)?.amount || 0;
                return (
                  <div key={person.id} className="house-person-row">
                    <div>
                      <strong>{person.name}</strong>
                      <small>{person.email || person.label || "House person"}</small>
                    </div>
                    <div>
                      <strong>{formatMoney(total)}</strong>
                      {split && <small>{split.percentage}% manual ownership</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {house.ownershipMode === "manualOwnership" && (
            <p className={summary.manualSplitValid ? "muted-text" : "danger-text"}>
              Manual ownership total: {summary.manualTotalPercentage.toFixed(1)}%. {summary.manualSplitValid ? "Looks valid." : "This should total 100%."}
            </p>
          )}
        </section>

        <section className="sub-card house-tab-card">
          <HouseSharingPanel
            house={house}
            members={(appData.houseMembers || []).filter(member => member.houseId === house.id)}
            invites={(appData.houseInvites || []).filter(invite => invite.houseId === house.id)}
            role={role}
            sharingStatus={sharingStatus}
            sharingBusy={sharingBusy}
            canManageSharing={canManageSharing}
            onRefresh={onRefreshSharedHouses}
            onPublish={onPublishHouse}
            onInvite={onInviteHouse}
            onAcceptInvite={onAcceptInvite}
            onDeclineInvite={onDeclineInvite}
            onCancelInvite={onCancelInvite}
            onChangeMemberRole={onChangeMemberRole}
            onRemoveMember={onRemoveMember}
          />
        </section>

        <section className="sub-card house-tab-card">
          <h4>Linked payments</h4>
          <p className="muted-text">{linkedTransactions.length} tracked app transaction(s) link to this house. Shared users should only see the safe contribution summary, not private account balances or unrelated transaction details.</p>
        </section>
      </div>
    </div>
  );
}

function HouseSharingPanel({
  house,
  members,
  invites,
  role,
  sharingStatus,
  sharingBusy,
  canManageSharing,
  onRefresh,
  onPublish,
  onInvite,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onChangeMemberRole,
  onRemoveMember
}) {
  const [identifier, setIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const pendingInvites = invites.filter(invite => invite.status === "pending");
  const acceptedInvites = invites.filter(invite => invite.status === "accepted");
  const setupMissing = /setup has not been run/i.test(String(sharingStatus || ""));

  function submitInvite(event) {
    event.preventDefault();
    onInvite(identifier, inviteRole);
    setIdentifier("");
  }

  return (
    <div className="house-sharing-panel">
      <div className="section-header compact-header">
        <div>
          <h4>Shared users</h4>
          <p className="muted-text">Role: {role}. Shared users receive only house details, people, splits and safe contributions.</p>
        </div>
        <button type="button" className="secondary-button small" onClick={onRefresh} disabled={Boolean(sharingBusy)}>Refresh</button>
      </div>

      {sharingStatus && (
        <div className={setupMissing ? "backup-warning-box" : "success-note"}>
          {sharingStatus}
        </div>
      )}

      <div className="row-actions">
        <button type="button" className="primary-button" onClick={onPublish} disabled={Boolean(sharingBusy) || !canManageSharing}>
          {house.sharedRole ? "Sync shared house" : "Enable sharing"}
        </button>
      </div>

      {canManageSharing ? (
        <form className="house-share-form" onSubmit={submitInvite}>
          <label>Email or username<input value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="friend@example.com" /></label>
          <label>Role<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select></label>
          <button className="secondary-button" disabled={Boolean(sharingBusy)}>Invite</button>
        </form>
      ) : (
        <p className="muted-text">Only house owners can invite users or change access.</p>
      )}

      <div className="house-person-list">
        {members.length === 0 ? (
          <p className="muted-text">No shared members loaded yet. Enable sharing or refresh after running the SQL setup.</p>
        ) : members.map(member => (
          <div key={member.userId || member.email} className="house-person-row">
            <div>
              <strong>{member.username || member.email || "Shared user"}</strong>
              <small>{member.email || member.userId}</small>
            </div>
            <div className="row-actions">
              {canManageSharing ? (
                <select value={member.role || "viewer"} onChange={event => onChangeMemberRole(member, event.target.value)} disabled={Boolean(sharingBusy)}>
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <strong>{member.role}</strong>
              )}
              {canManageSharing && <button type="button" className="danger-button small" onClick={() => onRemoveMember(member)} disabled={Boolean(sharingBusy)}>Remove</button>}
            </div>
          </div>
        ))}
      </div>

      {pendingInvites.length > 0 && (
        <div className="house-person-list">
          <h5>Pending invites</h5>
          {pendingInvites.map(invite => (
            <div key={invite.id} className="house-person-row">
              <div>
                <strong>{invite.invitedEmail || "Pending user"}</strong>
                <small>{invite.role} invite</small>
              </div>
              <div className="row-actions">
                {!canManageSharing && <button type="button" className="secondary-button small" onClick={() => onAcceptInvite(invite)} disabled={Boolean(sharingBusy)}>Accept</button>}
                {!canManageSharing && <button type="button" className="secondary-button small" onClick={() => onDeclineInvite(invite)} disabled={Boolean(sharingBusy)}>Decline</button>}
                {canManageSharing && <button type="button" className="danger-button small" onClick={() => onCancelInvite(invite)} disabled={Boolean(sharingBusy)}>Cancel</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {acceptedInvites.length > 0 && <p className="muted-text">{acceptedInvites.length} accepted invite record(s).</p>}
    </div>
  );
}

function InfoMetric({ label, value }) {
  return (
    <div className="loan-detail-card sub-card">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ContributionSplitList({ summary }) {
  if (summary.byPerson.length === 0) return <p className="muted-text">No contributions recorded yet.</p>;
  return (
    <div className="house-split-list">
      {summary.byPerson.map(person => (
        <div key={person.key} className="house-split-row">
          <span>{person.name}</span>
          <strong>{formatMoney(person.amount)} · {person.percentage.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

function HouseContributionTable({ contributions, people, onEditContribution, onDeleteContribution, canEdit = true }) {
  if (contributions.length === 0) return <p className="muted-text">No house contributions yet.</p>;
  return (
    <div className="loan-event-table-wrap">
      <table className="loan-event-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Person</th>
            <th>Type</th>
            <th>Source</th>
            <th>Amount</th>
            <th>Notes</th>
            {canEdit && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {[...contributions].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(item => {
            const person = people.find(candidate => candidate.id === item.personId);
            return (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td>{person?.name || item.personName || "Unassigned"}</td>
                <td>{formatContributionType(item.type)}</td>
                <td>{formatSourceType(item.sourceType)}</td>
                <td>{formatMoney(item.amount)}</td>
                <td>{item.notes || "—"}</td>
                {canEdit && (
                  <td>
                    <div className="row-actions">
                      <button type="button" className="secondary-button small" onClick={() => onEditContribution(item)}>Edit</button>
                      <button type="button" className="danger-button small" onClick={() => onDeleteContribution(item)}>Delete</button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HouseModal({ houseForm, editingHouse, accounts, updateHouseForm, closeHouseModal, submitHouse }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitHouse}>
        <div className="section-header">
          <h2>{editingHouse ? "Edit house" : "Add house"}</h2>
          <button type="button" className="icon-button" onClick={closeHouseModal}>×</button>
        </div>
        <div className="form-section-card">
          <h3>House details</h3>
          <div className="form-grid">
            <label>House name<input value={houseForm.name} onChange={event => updateHouseForm("name", event.target.value)} /></label>
            <label>Address/name label<input value={houseForm.addressLabel} onChange={event => updateHouseForm("addressLabel", event.target.value)} /></label>
            <label>Purchase price<input type="number" min="0" step="0.01" value={houseForm.purchasePrice} onChange={event => updateHouseForm("purchasePrice", event.target.value)} /></label>
            <label>Purchase date<input type="date" value={houseForm.purchaseDate} onChange={event => updateHouseForm("purchaseDate", event.target.value)} /></label>
            <label>Current estimated value<input type="number" min="0" step="0.01" value={houseForm.propertyValue} onChange={event => updateHouseForm("propertyValue", event.target.value)} /></label>
            <label>Ownership/contribution mode<select value={houseForm.ownershipMode} onChange={event => updateHouseForm("ownershipMode", event.target.value)}>
              {HOUSE_OWNERSHIP_MODES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label className="full-width">Notes<textarea value={houseForm.notes} onChange={event => updateHouseForm("notes", event.target.value)} /></label>
          </div>
        </div>
        <div className="form-section-card">
          <h3>Mortgage details</h3>
          <div className="form-grid">
            <label>Original mortgage amount<input type="number" min="0" step="0.01" value={houseForm.mortgageOriginalAmount} onChange={event => updateHouseForm("mortgageOriginalAmount", event.target.value)} /></label>
            <label>Current mortgage balance<input type="number" min="0" step="0.01" value={houseForm.mortgageCurrentBalance} onChange={event => updateHouseForm("mortgageCurrentBalance", event.target.value)} /></label>
            <label>Mortgage start date<input type="date" value={houseForm.mortgageStartDate} onChange={event => updateHouseForm("mortgageStartDate", event.target.value)} /></label>
            <label>Term years<input type="number" min="0" step="1" value={houseForm.mortgageTermYears} onChange={event => updateHouseForm("mortgageTermYears", event.target.value)} /></label>
            <label>Interest rate %<input type="number" min="0" step="0.01" value={houseForm.mortgageInterestRate} onChange={event => updateHouseForm("mortgageInterestRate", event.target.value)} /></label>
            <label>Rate type<select value={houseForm.mortgageRateType} onChange={event => updateHouseForm("mortgageRateType", event.target.value)}>
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
              <option value="tracker">Tracker</option>
            </select></label>
            <label>Fixed period end<input type="date" value={houseForm.mortgageFixedEndDate} onChange={event => updateHouseForm("mortgageFixedEndDate", event.target.value)} /></label>
            <label>Monthly repayment<input type="number" min="0" step="0.01" value={houseForm.mortgageMonthlyPayment} onChange={event => updateHouseForm("mortgageMonthlyPayment", event.target.value)} /></label>
            <label>Linked tracked account<select value={houseForm.linkedAccountId} onChange={event => updateHouseForm("linkedAccountId", event.target.value)}>
              <option value="">None</option>
              {accounts.filter(account => account.isActive !== false).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select></label>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeHouseModal}>Cancel</button>
          <button className="primary-button">{editingHouse ? "Save house" : "Add house"}</button>
        </div>
      </form>
    </div>
  );
}

function HouseContributionModal({ house, appData, contributionForm, updateContributionForm, submitContribution, editingContribution, closeContributionModal }) {
  const people = (appData.housePeople || []).filter(person => person.houseId === house.id);
  const sourceOptions = house.isSharedHouse
    ? HOUSE_SOURCE_TYPES.filter(([key]) => key !== "linkedTransaction")
    : HOUSE_SOURCE_TYPES;
  const linkedTransactions = (appData.transactions || [])
    .filter(transaction => transaction.type === "expense" && (!transaction.linkedHouseId || transaction.id === contributionForm.linkedTransactionId))
    .slice(0, 80);
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitContribution}>
        <div className="section-header">
          <h2>{editingContribution ? "Edit contribution" : "Add contribution"}: {house.name}</h2>
          <button type="button" className="icon-button" onClick={closeContributionModal}>×</button>
        </div>
        <div className="form-grid">
          <label>Person<select value={contributionForm.personId} onChange={event => updateContributionForm("personId", event.target.value)}>
            <option value="">Unassigned / type name below</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select></label>
          <label>Person name<input value={contributionForm.personName} onChange={event => updateContributionForm("personName", event.target.value)} /></label>
          <label>Amount<input type="number" min="0" step="0.01" value={contributionForm.amount} onChange={event => updateContributionForm("amount", event.target.value)} /></label>
          <label>Date<input type="date" value={contributionForm.date} onChange={event => updateContributionForm("date", event.target.value)} /></label>
          <label>Type<select value={contributionForm.type} onChange={event => updateContributionForm("type", event.target.value)}>
            {HOUSE_CONTRIBUTION_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Source<select value={contributionForm.sourceType} onChange={event => updateContributionForm("sourceType", event.target.value)}>
            {sourceOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {contributionForm.sourceType === "linkedTransaction" && (
            <label className="full-width">Linked transaction<select value={contributionForm.linkedTransactionId} onChange={event => updateContributionForm("linkedTransactionId", event.target.value)}>
              <option value="">Choose transaction</option>
              {linkedTransactions.map(transaction => (
                <option key={transaction.id} value={transaction.id}>{transaction.date} · {transaction.title} · {formatMoney(transaction.amount, false)}</option>
              ))}
            </select></label>
          )}
          <label className="full-width">Notes<textarea value={contributionForm.notes} onChange={event => updateContributionForm("notes", event.target.value)} /></label>
        </div>
        {contributionForm.sourceType === "external" && <p className="backup-warning-box">External contributions are recorded for the house only. They do not change tracked account balances.</p>}
        {contributionForm.sourceType === "linkedTransaction" && <p className="backup-warning-box">Linked transactions already affect account balances. This records the house contribution view only.</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeContributionModal}>Cancel</button>
          <button className="primary-button">{editingContribution ? "Save contribution" : "Add contribution"}</button>
        </div>
      </form>
    </div>
  );
}

function HousePersonModal({ house, personForm, updatePersonForm, submitPerson, closePersonModal }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitPerson}>
        <div className="section-header">
          <h2>Add person: {house.name}</h2>
          <button type="button" className="icon-button" onClick={closePersonModal}>×</button>
        </div>
        <div className="form-grid">
          <label>Name<input value={personForm.name} onChange={event => updatePersonForm("name", event.target.value)} /></label>
          <label>Email / optional<input type="email" value={personForm.email} onChange={event => updatePersonForm("email", event.target.value)} /></label>
          <label>Label<input value={personForm.label} onChange={event => updatePersonForm("label", event.target.value)} placeholder="Partner, parent, solicitor" /></label>
          <label>Manual ownership %<input type="number" min="0" max="100" step="0.01" value={personForm.ownershipPercentage} onChange={event => updatePersonForm("ownershipPercentage", event.target.value)} /></label>
        </div>
        <p className="muted-text">Manual ownership is separate from contribution tracking and does not change account balances.</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closePersonModal}>Cancel</button>
          <button className="primary-button">Add person</button>
        </div>
      </form>
    </div>
  );
}

function formatContributionType(value) {
  return HOUSE_CONTRIBUTION_TYPES.find(([key]) => key === value)?.[1] || "Other";
}

function formatSourceType(value) {
  return HOUSE_SOURCE_TYPES.find(([key]) => key === value)?.[1] || "External contribution";
}

function LoanTile({ loan, index, selected, onSelect }) {
  const isMortgage = loan.type === "mortgage";
  const fallbackName = isMortgage ? `Mortgage ${index + 1}` : `Loan ${index + 1}`;

  return (
    <button
      type="button"
      className={`loan-summary-tile ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="loan-summary-type">{isMortgage ? "Mortgage" : "Student loan"}</span>
      <strong>{loan.name || fallbackName}</strong>
      <span className="loan-summary-amount">{formatMoney(loan.currentBalance, false)}</span>
      <small>{selected ? "Click to hide details" : "Click to view details"}</small>
    </button>
  );
}

function LoanDetailPanel({ loan, events, transactions, appData, onEdit, onArchive, onBalanceUpdate, onClose }) {
  const estimate = calculateLoanEstimate(loan);
  const isMortgage = loan.type === "mortgage";
  const isStudentLoan = loan.type === "studentLoan";
  const warnings = getLoanValidationWarnings(loan);

  return (
    <section className="card loan-detail-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">{isMortgage ? "Mortgage details" : "Student loan details"}</p>
          <h3>{loan.name}</h3>
          <p className="muted">Balance checked {loan.balanceDate || "not set"}</p>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary-button" onClick={onBalanceUpdate}>Update balance</button>
          <button type="button" className="secondary-button" onClick={onEdit}>Edit</button>
          <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          <button type="button" className="danger-button" onClick={onArchive}>Archive</button>
        </div>
      </div>

      <LoanWarnings warnings={warnings} />
      {isStudentLoan && <StudentLoanDetails loan={loan} estimate={estimate} events={events} appData={appData} />}
      {isMortgage && <MortgageLoanDetails loan={loan} estimate={estimate} events={events} transactions={transactions} appData={appData} />}
    </section>
  );
}

function StudentLoanDetails({ loan, estimate, events, appData }) {
  const details = loan.studentLoanDetails || {};
  const plan = getStudentLoanPlan(details.planType);
  const timelineEvents = appData ? getLoanTimelineEvents(appData, loan) : getRecentEvents(events);

  return (
    <div className="stack">
      <div className="loan-detail-grid">
        <div className="sub-card loan-detail-card">
          <small>Current balance</small>
          <strong>{formatMoney(loan.currentBalance)}</strong>
          <p className="muted">Manual/SLC statement balance.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Plan</small>
          <strong>{plan.label}</strong>
          <p className="muted">Repays {(plan.repaymentRate * 100).toFixed(0)}% above {formatMoney(plan.annualThreshold, false)} annual threshold.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Estimated monthly repayment</small>
          <strong>{formatMoney(estimate.monthlyRepayment)}</strong>
          <p className="muted">Based on salary entered.</p>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Write-off estimate</small>
          <strong>{estimate.projectedWriteOffDate || "Not enough data"}</strong>
          <p className="muted">{plan.writeOffNote}</p>
        </div>
      </div>

      <details className="loan-extra-details-card">
        <summary>Extra details</summary>
        <div className="loan-detail-grid">
          <div className="sub-card loan-detail-card">
            <small>Salary used</small>
            <strong>{formatMoney(details.grossAnnualSalary || 0, false)}</strong>
            <p className="muted">Annual estimate before tax.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Interest rate used</small>
            <strong>{estimate.annualInterestRate.toFixed(2)}%</strong>
            <p className="muted">{plan.interestDescription || "Current estimate."}</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Monthly interest</small>
            <strong>{formatMoney(estimate.monthlyInterest)}</strong>
            <p className="muted">Estimated interest added this month.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Balance movement</small>
            <strong className={estimate.monthlyCapitalPaid > 0 ? "positive-text" : "danger-text"}>{formatMoney(estimate.monthlyCapitalPaid)}</strong>
            <p className="muted">Estimated capital reduction after interest.</p>
          </div>
        </div>
        <LoanEventList events={timelineEvents} />
      </details>
    </div>
  );
}

function MortgageLoanDetails({ loan, estimate, events, transactions, appData }) {
  const details = loan.mortgageDetails || {};
  const mortgageProgress = getMortgageProgressSnapshot(loan, transactions);
  const effectiveLoan = {
    ...loan,
    currentBalance: mortgageProgress.currentBalance,
    balanceDate: mortgageProgress.currentDate
  };
  const liveEstimate = calculateLoanEstimate(effectiveLoan);
  const payoffDate = liveEstimate.projectedPayoffMonths ? getProjectedDateFromMonths(liveEstimate.projectedPayoffMonths, mortgageProgress.currentDate) : null;
  const originalAmount = mortgageProgress.originalAmount;
  const currentBalance = mortgageProgress.currentBalance;
  const totalPaidOff = mortgageProgress.totalPaidOff;
  const monthlyPayment = Number(details.monthlyPayment || 0);
  const monthlyOverpayment = Number(details.plannedMonthlyOverpayment || 0);
  const chartModel = buildMortgageChartData(effectiveLoan, liveEstimate, transactions, mortgageProgress);
  const chartData = chartModel.data;
  const hasProjection = chartData.length > 1;
  const timelineEvents = appData ? getLoanTimelineEvents(appData, loan) : getRecentEvents(events);
  const overpaymentSummary = appData ? getMortgageOverpaymentSummary(appData, loan) : null;
  const trackedInterest = getTrackedInterest(timelineEvents);
  const totalProjectedPaidAtEnd = getFinalProjectedTotalPaid(chartData);
  const totalProjectedInterestAtEnd = totalProjectedPaidAtEnd !== null && originalAmount > 0
    ? Math.max(0, totalProjectedPaidAtEnd - originalAmount)
    : null;

  return (
    <div className="stack mortgage-focused-view">
      <div className="mortgage-main-grid">
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Total balance</small>
          <strong>{formatMoney(currentBalance)}</strong>
          <p className="muted">Current amount still owed.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card positive-card-soft">
          <small>Total paid off</small>
          <strong>{formatMoney(totalPaidOff)}</strong>
          <p className="muted">Original loan minus current balance.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Interest rate</small>
          <strong>{Number(details.currentRate || 0).toFixed(2)}%</strong>
          <p className="muted">{details.interestType || "Rate type not set"} rate.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Monthly repayment</small>
          <strong>{formatMoney(monthlyPayment)}</strong>
          <p className="muted">{monthlyOverpayment > 0 ? `+ ${formatMoney(monthlyOverpayment)} overpayment planned.` : "No planned overpayment."}</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Fixed finish date</small>
          <strong>{details.fixedUntil || "Not set"}</strong>
          <p className="muted">Used for rate-ending reminders.</p>
        </div>
        <div className="sub-card loan-detail-card mortgage-main-card">
          <small>Final finish date</small>
          <strong>{payoffDate || "Not enough data"}</strong>
          <p className="muted">Projected from current balance, rate and payment.</p>
        </div>
      </div>

      {hasProjection ? (
        <div className="loan-chart-card mortgage-balance-chart">
          <div className="section-header compact-header">
            <div>
              <h4>Mortgage balance projection</h4>
              <p className="muted">Starts at the mortgage start date, shows total payments made so far, then fades the projected total paid line including future interest.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="timelineX"
                type="number"
                domain={chartModel.domain}
                ticks={chartModel.ticks.map(tick => tick.value)}
                tickFormatter={value => chartModel.tickLabelLookup[String(roundAxisValue(value))] || ""}
                interval={0}
              />
              <YAxis tickFormatter={value => `£${Math.round(value / 1000)}k`} />
              <Tooltip content={<MortgageChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="balance" name="Amount owed" stroke="var(--primary)" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="totalPaidActual" name="Total paid to date" stroke="var(--green)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
              <Line type="monotone" dataKey="totalPaidProjected" name="Projected total paid" stroke="var(--green)" strokeWidth={3} strokeDasharray="7 7" strokeOpacity={0.45} dot={false} connectNulls={false} />
              {chartData.some(point => Number.isFinite(point.linkedPaymentBalance)) && (
                <Line type="linear" dataKey="linkedPaymentBalance" name="Linked payment" stroke="var(--orange)" strokeWidth={0} dot={{ r: 5 }} activeDot={{ r: 7 }} connectNulls={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card warning-row orange">
          <strong>Mortgage projection needs balance, interest rate and monthly payment.</strong>
          <small>Add those details to see the graph and final finish estimate.</small>
        </div>
      )}

      <details className="loan-extra-details-card mortgage-extra-details">
        <summary>Extra details</summary>
        <div className="loan-detail-grid">
          <div className="sub-card loan-detail-card">
            <small>Monthly interest</small>
            <strong>{formatMoney(liveEstimate.monthlyInterest)}</strong>
            <p className="muted">Estimated interest added this month.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total interest gained/added</small>
            <strong>{trackedInterest > 0 ? formatMoney(trackedInterest) : "Not tracked yet"}</strong>
            <p className="muted">Only counts logged interest events. Manual balance changes are kept separate.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total projected amount paid at end</small>
            <strong>{totalProjectedPaidAtEnd !== null ? formatMoney(totalProjectedPaidAtEnd) : "Not enough data"}</strong>
            <p className="muted">Total projected payments across the mortgage, including interest.</p>
          </div>
          <div className="sub-card loan-detail-card">
            <small>Total projected interest at end</small>
            <strong>{totalProjectedInterestAtEnd !== null ? formatMoney(totalProjectedInterestAtEnd) : formatMoney(liveEstimate.projectedTotalInterest || 0)}</strong>
            <p className="muted">Projected total paid minus the original amount borrowed.</p>
          </div>
          <div className="sub-card loan-detail-card positive-card-soft">
            <small>Overpayment saving</small>
            <strong>{formatMoney(liveEstimate.overpaymentInterestSaved || 0, false)}</strong>
            <p className="muted">{liveEstimate.overpaymentMonthsSaved || 0} months saved from current planned overpayment.</p>
          </div>
          {overpaymentSummary && (
            <div className={`sub-card loan-detail-card ${overpaymentSummary.usedPercent >= 90 ? "warning-card-soft" : ""}`}>
              <small>Overpaid this year</small>
              <strong>{formatMoney(overpaymentSummary.overpaidThisYear)}</strong>
              <p className="muted">{overpaymentSummary.usedPercent.toFixed(1)}% of {formatMoney(overpaymentSummary.yearlyAllowance)} yearly limit used. {formatMoney(overpaymentSummary.remainingAllowance)} left.</p>
            </div>
          )}
        </div>
        <LoanEventList events={timelineEvents} />
      </details>
    </div>
  );
}

function LoanWarnings({ warnings }) {
  if (!warnings?.length) return null;

  return (
    <div className="loan-warning-list">
      {warnings.map((warning, index) => (
        <div key={`${warning}-${index}`} className="warning-row orange">
          <strong>Check this</strong>
          <small>{warning}</small>
        </div>
      ))}
    </div>
  );
}

function LoanEventList({ events }) {
  return (
    <div className="loan-event-list">
      <div className="section-header compact-header">
        <div>
          <h4>Loan event history</h4>
          <p className="muted">Includes manual balance updates and linked loan-payment transactions.</p>
        </div>
        <span className="pill">{events.length} event(s)</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">No loan events yet. Link a transaction to this loan or add a manual balance update.</p>
      ) : (
        <div className="loan-event-table-wrap">
          <table className="loan-event-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Payment</th>
                <th>Interest</th>
                <th>Capital</th>
                <th>Overpayment</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id || `${event.date}-${event.type}-${event.note}`}>
                  <td>{event.date || "—"}</td>
                  <td><span className={`pill ${event.type === "overpayment" ? "warning" : event.type === "balanceAdjustment" ? "transfer" : ""}`}>{formatEventType(event.type)}</span></td>
                  <td>{event.paymentAmount !== undefined ? formatMoney(event.paymentAmount) : "—"}</td>
                  <td>{event.interestAmount !== undefined ? formatMoney(event.interestAmount) : "—"}</td>
                  <td>{event.principalAmount !== undefined ? formatMoney(event.principalAmount) : event.amount !== undefined ? formatMoney(Math.abs(Number(event.amount || 0))) : "—"}</td>
                  <td>{Number(event.overpaymentAmount || 0) > 0 ? formatMoney(event.overpaymentAmount) : "—"}</td>
                  <td><small>{event.note || event.source || "—"}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatEventType(type) {
  if (type === "balanceAdjustment") return "Balance update";
  if (type === "overpayment") return "Overpayment";
  if (type === "repayment") return "Repayment";
  if (type === "interestAdded" || type === "interest") return "Interest";
  return type || "Event";
}

function buildMortgageChartData(loan, estimate, transactions = [], suppliedProgress = null) {
  const progress = suppliedProgress || getMortgageProgressSnapshot(loan, transactions);
  const originalAmount = progress.originalAmount;
  const currentBalance = progress.currentBalance;
  const currentDate = progress.currentDate;
  const startDate = progress.startDate;
  const currentTotalPaidToDate = progress.totalPaidToDate;

  const linkedPayments = getLinkedLoanTransactions(transactions, loan.id, startDate, currentDate);
  const chartPoints = [];

  chartPoints.push({
    date: startDate,
    label: formatChartDate(startDate),
    dateLabel: formatChartDateLong(startDate),
    balance: roundCurrency(originalAmount),
    totalPaidActual: 0,
    totalPaidProjected: null,
    pointType: "start"
  });

  let estimatedBalance = originalAmount;
  let runningTotalPaid = 0;
  let lastPaymentDate = startDate;

  linkedPayments.forEach(payment => {
    const balanceBeforePayment = applyEstimatedInterestBetweenDates(estimatedBalance, lastPaymentDate, payment.date, loan);
    const principal = estimateLinkedPrincipal(payment, balanceBeforePayment, loan);
    runningTotalPaid += Number(payment.amount || 0);
    estimatedBalance = Math.max(0, balanceBeforePayment - principal);

    chartPoints.push({
      date: payment.date,
      label: formatChartDate(payment.date),
      dateLabel: formatChartDateLong(payment.date),
      balance: roundCurrency(estimatedBalance),
      totalPaidActual: roundCurrency(runningTotalPaid),
      totalPaidProjected: null,
      linkedPaymentBalance: roundCurrency(estimatedBalance),
      linkedPaymentAmount: roundCurrency(payment.amount),
      linkedPaymentPrincipal: roundCurrency(principal),
      linkedPaymentInterest: roundCurrency(payment.interest || Math.max(0, Number(payment.amount || 0) - principal)),
      linkedPaymentTitle: payment.title,
      linkedPaymentInferred: payment.principalWasInferred,
      pointType: "linkedPayment"
    });

    lastPaymentDate = payment.date;
  });

  upsertChartPoint(chartPoints, {
    date: currentDate,
    label: formatChartDate(currentDate),
    dateLabel: isSameDate(currentDate, today()) ? `Today · ${formatChartDateLong(currentDate)}` : formatChartDateLong(currentDate),
    balance: roundCurrency(currentBalance),
    totalPaidActual: roundCurrency(currentTotalPaidToDate),
    totalPaidProjected: roundCurrency(currentTotalPaidToDate),
    pointType: "current"
  });

  buildFutureMortgagePaymentSeries(loan, estimate, currentDate, currentBalance, currentTotalPaidToDate)
    .forEach(point => chartPoints.push(point));

  const sortedPoints = chartPoints
    .filter(point => point.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return buildCompressedMortgageChartModel(sortedPoints, startDate, currentDate);
}

function getMortgageProgressSnapshot(loan, transactions = []) {
  const originalAmount = Number(loan.originalAmount || loan.currentBalance || 0);
  const baseBalance = Number(loan.currentBalance || 0);
  const baseDate = normaliseDate(loan.balanceDate) || today();
  const startDate = normaliseDate(loan.startDate) || baseDate;
  const todayDate = today();
  const latestLinkedDate = getLatestLinkedLoanTransactionDate(transactions, loan.id);
  const currentDate = [todayDate, baseDate, latestLinkedDate]
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || todayDate;

  const linkedPaymentsToCurrent = getLinkedLoanTransactions(transactions, loan.id, startDate, currentDate);
  const linkedPaymentsAfterBalanceDate = linkedPaymentsToCurrent.filter(payment => payment.date >= baseDate);
  const principalSinceBalanceDate = linkedPaymentsAfterBalanceDate.reduce((total, payment) => {
    const approximateBalance = Math.max(0, baseBalance - total);
    return total + estimateLinkedPrincipal(payment, approximateBalance, loan);
  }, 0);

  const currentBalance = roundCurrency(Math.max(0, baseBalance - principalSinceBalanceDate));
  const totalPaidOff = originalAmount > 0 ? roundCurrency(Math.max(0, originalAmount - currentBalance)) : 0;
  const linkedPaymentTotal = linkedPaymentsToCurrent.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const estimatedRegularPaidToDate = estimateRegularPaymentsToDate(loan, startDate, currentDate);
  const totalPaidToDate = roundCurrency(Math.max(totalPaidOff, linkedPaymentTotal, estimatedRegularPaidToDate));

  return {
    originalAmount,
    baseBalance,
    baseDate,
    startDate,
    currentDate,
    currentBalance,
    totalPaidOff,
    linkedPaymentTotal: roundCurrency(linkedPaymentTotal),
    principalSinceBalanceDate: roundCurrency(principalSinceBalanceDate),
    totalPaidToDate
  };
}

function getLatestLinkedLoanTransactionDate(transactions, loanId) {
  const dates = (transactions || [])
    .filter(transaction => {
      const linkedId = transaction.linkedLoanId || transaction.loanId || transaction.relatedLoanId || transaction.mortgageLoanId;
      return linkedId === loanId;
    })
    .map(transaction => normaliseDate(transaction.date))
    .filter(Boolean)
    .sort();

  return dates[dates.length - 1] || null;
}

function buildCompressedMortgageChartModel(points, startDate, currentDate) {
  const endDate = points[points.length - 1]?.date || currentDate;
  const focusStart = addMonthsToDate(currentDate, -12);
  const focusEnd = addMonthsToDate(currentDate, 12);

  const data = points.map(point => ({
    ...point,
    timelineX: compressedTimelineValue(point.date, focusStart, focusEnd)
  }));

  const ticks = buildCompressedMortgageTicks(startDate, currentDate, endDate, focusStart, focusEnd);
  const tickLabelLookup = Object.fromEntries(ticks.map(tick => [String(tick.value), tick.label]));
  const values = [...data.map(point => point.timelineX), ...ticks.map(tick => tick.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    data,
    ticks,
    tickLabelLookup,
    domain: [Math.floor(min) - 0.5, Math.ceil(max) + 0.5]
  };
}

function buildCompressedMortgageTicks(startDate, currentDate, endDate, focusStart, focusEnd) {
  const tickDates = new Set([startDate, currentDate, endDate]);

  for (let date = startOfYear(startDate); date < focusStart; date = addMonthsToDate(date, 12)) {
    if (date >= startDate) tickDates.add(date);
  }

  for (let date = startOfMonth(focusStart); date <= focusEnd; date = addMonthsToDate(date, 3)) {
    if (date >= startDate && date <= endDate) tickDates.add(date);
  }

  for (let date = startOfYear(focusEnd); date <= endDate; date = addMonthsToDate(date, 12)) {
    if (date >= focusEnd) tickDates.add(date);
  }

  return [...tickDates]
    .filter(Boolean)
    .sort()
    .map(date => {
      const inFocus = date >= focusStart && date <= focusEnd;
      const isBoundary = date === startDate || date === currentDate || date === endDate;
      return {
        date,
        value: compressedTimelineValue(date, focusStart, focusEnd),
        label: isBoundary || inFocus ? formatChartDateShort(date) : new Date(date).getFullYear().toString()
      };
    })
    .filter((tick, index, array) => index === 0 || tick.value !== array[index - 1].value);
}

function compressedTimelineValue(dateValue, focusStart, focusEnd) {
  const date = normaliseDate(dateValue);
  if (!date) return 0;

  const focusWidthMonths = monthsBetween(focusStart, focusEnd);
  if (date < focusStart) {
    return roundAxisValue(-monthsBetween(date, focusStart) / 12);
  }

  if (date > focusEnd) {
    return roundAxisValue(focusWidthMonths + (monthsBetween(focusEnd, date) / 12));
  }

  return roundAxisValue(monthsBetween(focusStart, date));
}

function monthsBetween(startDateValue, endDateValue) {
  const start = parseIsoDateLocal(startDateValue);
  const end = parseIsoDateLocal(endDateValue);
  if (!start || !end) return 0;
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375;
  return Math.max(0, (end.getTime() - start.getTime()) / msPerMonth);
}

function getMortgageMonthlyPayment(loan) {
  const details = loan.mortgageDetails || {};
  return Number(details.monthlyPayment || 0) + Number(details.plannedMonthlyOverpayment || 0);
}

function estimateRegularPaymentsToDate(loan, startDate, currentDate) {
  const monthlyPayment = getMortgageMonthlyPayment(loan);
  const elapsedMonths = getCompletedMonthCount(startDate, currentDate);
  if (monthlyPayment <= 0 || elapsedMonths <= 0) return 0;
  return roundCurrency(monthlyPayment * elapsedMonths);
}

function applyEstimatedInterestBetweenDates(balance, fromDate, toDate, loan) {
  const annualRate = Number(loan.mortgageDetails?.currentRate || 0);
  const monthlyRate = annualRate / 100 / 12;
  const elapsedMonths = getCompletedMonthCount(fromDate, toDate);
  let estimatedBalance = Number(balance || 0);

  for (let index = 0; index < elapsedMonths; index += 1) {
    estimatedBalance += estimatedBalance * monthlyRate;
  }

  return estimatedBalance;
}

function buildFutureMortgagePaymentSeries(loan, estimate, currentDate, currentBalance, totalPaidToDate) {
  const details = loan?.mortgageDetails || {};
  const monthlyPayment = Math.max(0, Number(details.monthlyPayment || 0) + Number(details.plannedMonthlyOverpayment || 0));
  const annualRate = Math.max(0, Number(details.currentRate || 0));
  const monthlyRate = annualRate / 100 / 12;
  const startingBalance = Math.max(0, Number(currentBalance || 0));
  const startingTotalPaid = Math.max(0, Number(totalPaidToDate || 0));
  const startDate = normaliseDate(currentDate) || today();

  if (startingBalance <= 0 || monthlyPayment <= 0) return [];

  const monthlyInterestNow = startingBalance * monthlyRate;
  if (monthlyRate > 0 && monthlyPayment <= monthlyInterestNow) {
    return [{
      date: addMonthsToDate(startDate, 12),
      label: formatChartDate(addMonthsToDate(startDate, 12)),
      dateLabel: `${formatChartDateLong(addMonthsToDate(startDate, 12))} · projection paused`,
      balance: roundCurrency(startingBalance + (monthlyInterestNow * 12)),
      totalPaidActual: null,
      totalPaidProjected: roundCurrency(startingTotalPaid),
      pointType: "projectionWarning"
    }];
  }

  const estimatedMonths = Number(estimate?.projectedPayoffMonths || 0);
  const remainingTermMonths = Number(details.remainingTermMonths || (Number(details.termYears || 0) * 12) || 0);
  const maxMonths = Math.min(720, Math.max(1, Math.ceil(estimatedMonths || remainingTermMonths || 360)));
  const points = [];
  let balance = startingBalance;
  let totalPaid = startingTotalPaid;

  for (let month = 1; month <= maxMonths && balance > 0.01; month += 1) {
    const interest = balance * monthlyRate;
    const payment = Math.min(monthlyPayment, balance + interest);
    balance = Math.max(0, balance + interest - payment);
    totalPaid += payment;

    const shouldShowPoint = month === 1 || month % 12 === 0 || balance <= 0.01 || month === maxMonths;
    if (shouldShowPoint) {
      const date = addMonthsToDate(startDate, month);
      points.push({
        date,
        label: formatChartDate(date),
        dateLabel: formatChartDateLong(date),
        balance: roundCurrency(balance),
        totalPaidActual: null,
        totalPaidProjected: roundCurrency(totalPaid),
        pointType: "projected"
      });
    }
  }

  return points;
}

function getCompletedMonthCount(startDateValue, endDateValue) {
  const start = parseIsoDateLocal(startDateValue);
  const end = parseIsoDateLocal(endDateValue);
  if (!start || !end || end <= start) return 0;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function getFinalProjectedTotalPaid(chartData) {
  const projectedPoints = [...(chartData || [])]
    .filter(point => Number.isFinite(Number(point.totalPaidProjected)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (projectedPoints.length === 0) return null;
  return Number(projectedPoints[projectedPoints.length - 1].totalPaidProjected);
}

function MortgageChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const data = payload.find(item => item?.payload)?.payload || {};
  const visibleItems = payload.filter(item => Number.isFinite(Number(item.value)) && item.dataKey !== "linkedPaymentBalance");

  return (
    <div className="chart-tooltip loan-chart-tooltip">
      <strong>{data.dateLabel || label}</strong>
      {visibleItems.map(item => (
        <small key={item.dataKey}>
          {item.name}: {formatMoney(item.value)}
        </small>
      ))}
      {Number.isFinite(data.linkedPaymentAmount) && (
        <div className="linked-payment-tooltip-block">
          <small><strong>Linked payment:</strong> {data.linkedPaymentTitle || "Mortgage payment"}</small>
          <small>Payment made: {formatMoney(data.linkedPaymentAmount)}</small>
          <small>Estimated paid off: {formatMoney(data.linkedPaymentPrincipal || 0)}</small>
          {data.linkedPaymentInferred && <small className="muted">Capital part estimated from rate because no split was stored.</small>}
        </div>
      )}
    </div>
  );
}

function getLinkedLoanTransactions(transactions, loanId, startDate, endDate) {
  return (transactions || [])
    .filter(transaction => {
      const linkedId = transaction.linkedLoanId || transaction.loanId || transaction.relatedLoanId || transaction.mortgageLoanId;
      const date = normaliseDate(transaction.date);
      return linkedId === loanId && date && date >= startDate && date <= endDate;
    })
    .map(transaction => {
      const amount = Math.abs(Number(transaction.amount || 0));
      const explicitPrincipal = transaction.loanPrincipalAmount ?? transaction.principalAmount ?? transaction.mortgagePrincipalAmount ?? transaction.loanSplit?.principal;
      const explicitInterest = transaction.loanInterestAmount ?? transaction.interestAmount ?? transaction.mortgageInterestAmount ?? transaction.loanSplit?.interest;
      const principal = explicitPrincipal === undefined || explicitPrincipal === null || explicitPrincipal === ""
        ? null
        : Math.abs(Number(explicitPrincipal || 0));
      const interest = explicitInterest === undefined || explicitInterest === null || explicitInterest === ""
        ? null
        : Math.abs(Number(explicitInterest || 0));

      return {
        id: transaction.id,
        date: normaliseDate(transaction.date),
        title: transaction.title || transaction.note || "Linked mortgage payment",
        amount,
        principal,
        interest,
        principalWasInferred: principal === null
      };
    })
    .filter(payment => payment.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function estimateLinkedPrincipal(payment, currentEstimatedBalance, loan) {
  if (Number.isFinite(payment.principal) && payment.principal !== null) {
    return Math.max(0, Math.min(payment.principal, currentEstimatedBalance));
  }

  const annualRate = Number(loan.mortgageDetails?.currentRate || 0);
  const estimatedMonthlyInterest = currentEstimatedBalance * (annualRate / 100) / 12;
  return Math.max(0, Math.min(currentEstimatedBalance, Number(payment.amount || 0) - estimatedMonthlyInterest));
}

function upsertChartPoint(points, point) {
  const existingIndex = points.findIndex(item => item.date === point.date && item.pointType !== "linkedPayment");
  if (existingIndex >= 0) {
    points[existingIndex] = { ...points[existingIndex], ...point };
    return;
  }
  points.push(point);
}

function normaliseDate(value) {
  if (!value) return null;
  const date = parseIsoDateLocal(value);
  return date ? formatIsoDateLocal(date) : null;
}

function addMonthsToDate(dateValue, months) {
  return addMonthsToIsoDate(dateValue, Number(months || 0));
}

function formatChartDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function formatChartDateShort(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function formatChartDateLong(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function startOfMonth(dateValue) {
  const date = parseIsoDateLocal(dateValue);
  if (!date) return dateValue;
  return formatIsoDateLocal(new Date(date.getFullYear(), date.getMonth(), 1));
}

function startOfYear(dateValue) {
  const date = parseIsoDateLocal(dateValue);
  if (!date) return dateValue;
  return formatIsoDateLocal(new Date(date.getFullYear(), 0, 1));
}

function isSameDate(a, b) {
  return normaliseDate(a) === normaliseDate(b);
}

function roundAxisValue(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getTrackedInterest(events) {
  return (events || []).reduce((total, event) => {
    if (Number(event.interestAmount || 0) > 0) return total + Math.abs(Number(event.interestAmount || 0));
    if (["interest", "interestAdded", "monthlyInterest"].includes(event.type)) return total + Math.abs(Number(event.amount || 0));
    return total;
  }, 0);
}

function getRecentEvents(events) {
  return [...(events || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 3);
}

function LoanModal({ loanForm, editingLoan, updateLoanForm, closeLoanModal, submitLoan }) {
  const selectedPlan = getStudentLoanPlan(loanForm.planType);

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submitLoan}>
        <div className="section-header">
          <h2>{editingLoan ? "Edit loan" : "Add loan"}</h2>
          <button type="button" className="icon-button" onClick={closeLoanModal}>×</button>
        </div>

        <div className="form-grid">
          <label>
            Loan type
            <select value={loanForm.type} onChange={event => updateLoanForm("type", event.target.value)}>
              <option value="studentLoan">Student loan</option>
              <option value="mortgage">Mortgage</option>
            </select>
          </label>

          <label>
            Loan name
            <input value={loanForm.name} onChange={event => updateLoanForm("name", event.target.value)} placeholder="Plan 2 Student Loan" />
          </label>

          <label>
            Original amount
            <input type="number" min="0" step="0.01" value={loanForm.originalAmount} onChange={event => updateLoanForm("originalAmount", event.target.value)} placeholder="45000" />
          </label>

          <label>
            Current balance
            <input type="number" min="0" step="0.01" value={loanForm.currentBalance} onChange={event => updateLoanForm("currentBalance", event.target.value)} placeholder="52000" />
          </label>

          <label>
            Balance date
            <input type="date" value={loanForm.balanceDate} onChange={event => updateLoanForm("balanceDate", event.target.value)} />
          </label>

          <label>
            Start date
            <input type="date" value={loanForm.startDate} onChange={event => updateLoanForm("startDate", event.target.value)} />
          </label>
        </div>

        {loanForm.type === "studentLoan" ? (
          <div className="form-section-card">
            <h3>Student loan settings</h3>
            <div className="form-grid">
              <label>
                Repayment plan
                <select value={loanForm.planType} onChange={event => updateLoanForm("planType", event.target.value)}>
                  {studentLoanPlanOptions.map(plan => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
                </select>
                <small>{selectedPlan.label}: threshold {formatMoney(selectedPlan.annualThreshold, false)} per year.</small>
              </label>

              <label>
                Gross annual salary
                <input type="number" min="0" step="0.01" value={loanForm.grossAnnualSalary} onChange={event => updateLoanForm("grossAnnualSalary", event.target.value)} placeholder="32000" />
              </label>

              <label>
                Repayment start date
                <input type="date" value={loanForm.repaymentStartDate} onChange={event => updateLoanForm("repaymentStartDate", event.target.value)} />
              </label>

              <label>
                Pay frequency
                <select value={loanForm.payFrequency} onChange={event => updateLoanForm("payFrequency", event.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              <label>
                Employment type
                <select value={loanForm.employmentType} onChange={event => updateLoanForm("employmentType", event.target.value)}>
                  <option value="PAYE">PAYE</option>
                  <option value="self-employed">Self-employed</option>
                  <option value="overseas">Overseas</option>
                  <option value="not-working">Not working</option>
                </select>
              </label>

              <label>
                Salary growth %
                <input type="number" step="0.1" value={loanForm.salaryGrowthPercent} onChange={event => updateLoanForm("salaryGrowthPercent", event.target.value)} placeholder="3" />
              </label>

              <label>
                Manual interest override %
                <input type="number" min="0" step="0.01" value={loanForm.manualAnnualInterestRate} onChange={event => updateLoanForm("manualAnnualInterestRate", event.target.value)} placeholder={String(selectedPlan.annualInterestRate)} />
              </label>
            </div>
          </div>
        ) : (
          <div className="form-section-card">
            <h3>Mortgage settings</h3>
            <div className="form-grid">
              <label>
                Repayment type
                <select value={loanForm.repaymentType} onChange={event => updateLoanForm("repaymentType", event.target.value)}>
                  <option value="repayment">Repayment</option>
                  <option value="interestOnly">Interest-only</option>
                  <option value="partAndPart">Part-and-part</option>
                </select>
              </label>

              <label>
                Term length / years
                <input type="number" min="0" step="1" value={loanForm.termYears} onChange={event => updateLoanForm("termYears", event.target.value)} placeholder="25" />
              </label>

              <label>
                Remaining term / months
                <input type="number" min="0" step="1" value={loanForm.remainingTermMonths} onChange={event => updateLoanForm("remainingTermMonths", event.target.value)} placeholder="278" />
              </label>

              <label>
                Monthly payment
                <input type="number" min="0" step="0.01" value={loanForm.monthlyPayment} onChange={event => updateLoanForm("monthlyPayment", event.target.value)} placeholder="1150" />
              </label>

              <label>
                Payment day
                <input type="number" min="1" max="28" step="1" value={loanForm.paymentDay} onChange={event => updateLoanForm("paymentDay", event.target.value)} placeholder="1" />
              </label>

              <label>
                Interest type
                <select value={loanForm.interestType} onChange={event => updateLoanForm("interestType", event.target.value)}>
                  <option value="fixed">Fixed</option>
                  <option value="tracker">Tracker</option>
                  <option value="variable">Variable/SVR</option>
                  <option value="discounted">Discounted</option>
                  <option value="offset">Offset</option>
                </select>
              </label>

              <label>
                Current rate %
                <input type="number" min="0" step="0.01" value={loanForm.currentRate} onChange={event => updateLoanForm("currentRate", event.target.value)} placeholder="4.75" />
              </label>

              <label>
                Fixed/rate end date
                <input type="date" value={loanForm.fixedUntil} onChange={event => updateLoanForm("fixedUntil", event.target.value)} />
              </label>

              <label>
                Follow-on rate %
                <input type="number" min="0" step="0.01" value={loanForm.followOnRate} onChange={event => updateLoanForm("followOnRate", event.target.value)} placeholder="6.5" />
              </label>

              <label>
                Monthly overpayment
                <input type="number" min="0" step="0.01" value={loanForm.plannedMonthlyOverpayment} onChange={event => updateLoanForm("plannedMonthlyOverpayment", event.target.value)} placeholder="100" />
              </label>

              <label>
                Overpayment allowance %
                <input type="number" min="0" step="0.1" value={loanForm.overpaymentAllowancePercent} onChange={event => updateLoanForm("overpaymentAllowancePercent", event.target.value)} placeholder="10" />
              </label>

              <label>
                Property value
                <input type="number" min="0" step="0.01" value={loanForm.propertyValue} onChange={event => updateLoanForm("propertyValue", event.target.value)} placeholder="280000" />
              </label>

              <label className="checkbox-label full-width">
                <input
                  type="checkbox"
                  checked={loanForm.earlyRepaymentChargeApplies}
                  onChange={event => updateLoanForm("earlyRepaymentChargeApplies", event.target.checked)}
                />
                Early repayment charge may apply
              </label>
            </div>
          </div>
        )}

        <label className="full-width">
          Notes
          <textarea value={loanForm.notes} onChange={event => updateLoanForm("notes", event.target.value)} placeholder="Anything useful from the lender/SLC statement." />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={closeLoanModal}>Cancel</button>
          <button className="primary-button">{editingLoan ? "Save loan" : "Add loan"}</button>
        </div>
      </form>
    </div>
  );
}
