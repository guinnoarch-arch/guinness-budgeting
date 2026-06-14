import { createId } from "./ids.js";

export const HOUSE_CONTRIBUTION_TYPES = [
  ["deposit", "Deposit"],
  ["mortgagePayment", "Mortgage payment"],
  ["mortgageOverpayment", "Mortgage overpayment"],
  ["legalFees", "Legal fees"],
  ["stampDuty", "Stamp duty"],
  ["renovation", "Renovation"],
  ["repair", "Repair"],
  ["furnitureAppliance", "Furniture/appliance"],
  ["insurance", "Insurance"],
  ["serviceCharge", "Service charge"],
  ["other", "Other"]
];

export const HOUSE_SOURCE_TYPES = [
  ["external", "External contribution"],
  ["linkedTransaction", "Linked transaction"],
  ["manualAdjustment", "Manual adjustment"]
];

export const HOUSE_OWNERSHIP_MODES = [
  ["contributionTracking", "Contribution tracking only"],
  ["manualOwnership", "Manual ownership split"],
  ["contributionEstimate", "Contribution-based estimate"]
];

export const HOUSE_MEMBER_ROLES = [
  ["owner", "Owner"],
  ["editor", "Editor"],
  ["viewer", "Viewer"]
];

export function normaliseHouseRecord(record = {}) {
  const now = new Date().toISOString();
  const house = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const mortgage = house.mortgage || {};
  return {
    ...house,
    id: house.id || createId("house"),
    name: house.name || house.houseName || "House",
    addressLabel: house.addressLabel || house.address || "",
    purchasePrice: safeNumber(house.purchasePrice, 0),
    purchaseDate: house.purchaseDate || null,
    propertyValue: safeNumber(house.propertyValue ?? house.currentEstimatedValue, 0),
    notes: house.notes || "",
    status: house.status || (house.archived || house.archivedAt ? "archived" : "active"),
    archived: Boolean(house.archived || house.status === "archived" || house.archivedAt),
    archivedAt: house.archivedAt || null,
    ownershipMode: house.ownershipMode || "contributionTracking",
    linkedLoanId: house.linkedLoanId || house.migratedFromLoanId || null,
    mortgage: {
      originalAmount: safeNumber(mortgage.originalAmount ?? house.mortgageOriginalAmount, 0),
      currentBalance: safeNumber(mortgage.currentBalance ?? house.mortgageCurrentBalance, 0),
      startDate: mortgage.startDate || house.mortgageStartDate || null,
      termYears: safeNumber(mortgage.termYears ?? house.mortgageTermYears, 0),
      interestRate: safeNumber(mortgage.interestRate ?? house.mortgageInterestRate, 0),
      rateType: mortgage.rateType || house.mortgageRateType || "fixed",
      fixedEndDate: mortgage.fixedEndDate || house.mortgageFixedEndDate || null,
      monthlyPayment: safeNumber(mortgage.monthlyPayment ?? house.mortgageMonthlyPayment, 0),
      linkedAccountId: mortgage.linkedAccountId || house.linkedAccountId || null
    },
    createdBy: house.createdBy || null,
    createdAt: house.createdAt || now,
    updatedAt: house.updatedAt || now
  };
}

export function normaliseHousePersonRecord(record = {}) {
  const now = new Date().toISOString();
  const person = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  return {
    ...person,
    id: person.id || createId("house_person"),
    houseId: person.houseId || "",
    name: person.name || person.personName || "Person",
    linkedUserId: person.linkedUserId || null,
    email: person.email || null,
    label: person.label || person.roleLabel || "",
    createdAt: person.createdAt || now,
    updatedAt: person.updatedAt || now
  };
}

export function normaliseHouseContributionRecord(record = {}) {
  const now = new Date().toISOString();
  const contribution = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  return {
    ...contribution,
    id: contribution.id || createId("house_contribution"),
    houseId: contribution.houseId || contribution.linkedHouseId || "",
    personId: contribution.personId || null,
    personName: contribution.personName || contribution.paidBy || "",
    amount: Math.max(0, safeNumber(contribution.amount, 0)),
    date: contribution.date || new Date().toISOString().slice(0, 10),
    type: contribution.type || contribution.contributionType || "other",
    sourceType: contribution.sourceType || "external",
    linkedTransactionId: contribution.linkedTransactionId || null,
    paidByUserId: contribution.paidByUserId || null,
    notes: contribution.notes || "",
    createdBy: contribution.createdBy || null,
    createdAt: contribution.createdAt || now,
    updatedAt: contribution.updatedAt || now
  };
}

export function normaliseHouseMemberRecord(record = {}) {
  const now = new Date().toISOString();
  const member = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  return {
    ...member,
    id: member.id || createId("house_member"),
    houseId: member.houseId || "",
    userId: member.userId || "",
    role: ["owner", "editor", "viewer"].includes(member.role) ? member.role : "viewer",
    status: member.status || "active",
    createdAt: member.createdAt || now,
    updatedAt: member.updatedAt || now
  };
}

export function normaliseHouseInviteRecord(record = {}) {
  const now = new Date().toISOString();
  const invite = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  return {
    ...invite,
    id: invite.id || createId("house_invite"),
    houseId: invite.houseId || "",
    invitedEmail: invite.invitedEmail || "",
    invitedBy: invite.invitedBy || null,
    role: ["editor", "viewer"].includes(invite.role) ? invite.role : "viewer",
    status: invite.status || "pending",
    createdAt: invite.createdAt || now,
    updatedAt: invite.updatedAt || now
  };
}

export function normaliseHouseOwnershipSplitRecord(record = {}) {
  const now = new Date().toISOString();
  const split = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  return {
    ...split,
    id: split.id || createId("house_split"),
    houseId: split.houseId || "",
    personId: split.personId || "",
    percentage: safeNumber(split.percentage, 0),
    createdAt: split.createdAt || now,
    updatedAt: split.updatedAt || now
  };
}

export function createHouseFromMortgageLoan(loan = {}) {
  const details = loan.mortgageDetails || {};
  const now = loan.createdAt || new Date().toISOString();
  return normaliseHouseRecord({
    id: `house_from_${loan.id}`,
    name: loan.name || "House",
    propertyValue: details.propertyValue || 0,
    purchaseDate: loan.startDate || null,
    notes: loan.notes || "",
    status: loan.status || "active",
    archived: loan.status === "archived",
    archivedAt: loan.archivedAt || null,
    ownershipMode: "contributionTracking",
    linkedLoanId: loan.id,
    migratedFromLoanId: loan.id,
    mortgage: {
      originalAmount: loan.originalAmount || 0,
      currentBalance: loan.currentBalance || 0,
      startDate: loan.startDate || null,
      termYears: details.termYears || 0,
      interestRate: details.currentRate || 0,
      rateType: details.interestType || "fixed",
      fixedEndDate: details.fixedUntil || null,
      monthlyPayment: details.monthlyPayment || 0,
      linkedAccountId: details.linkedAccountId || null
    },
    createdAt: now,
    updatedAt: loan.updatedAt || now
  });
}

export function ensureHousesFromMortgageLoans(data = {}) {
  const houses = Array.isArray(data.houses) ? data.houses.map(normaliseHouseRecord) : [];
  const existingLinkedLoanIds = new Set(houses.map(house => house.linkedLoanId).filter(Boolean));
  const migrated = (data.loans || [])
    .filter(loan => loan?.type === "mortgage" && loan.id && !existingLinkedLoanIds.has(loan.id))
    .map(createHouseFromMortgageLoan);
  return [...houses, ...migrated];
}

export function createContributionFromTransaction(transaction, existingContribution = null) {
  const now = new Date().toISOString();
  const type = transaction.houseContributionType
    || (transaction.isLoanOverpayment ? "mortgageOverpayment" : "mortgagePayment");
  return normaliseHouseContributionRecord({
    ...(existingContribution || {}),
    id: existingContribution?.id || transaction.linkedHouseContributionId || createId("house_contribution"),
    houseId: transaction.linkedHouseId,
    personId: transaction.housePersonId || null,
    personName: transaction.housePersonName || transaction.housePaidBy || "",
    amount: Math.abs(Number(transaction.amount || 0)),
    date: transaction.date,
    type,
    sourceType: "linkedTransaction",
    linkedTransactionId: transaction.id,
    notes: transaction.houseContributionNotes || transaction.note || "",
    createdAt: existingContribution?.createdAt || transaction.createdAt || now,
    updatedAt: now
  });
}

export function syncHouseContributionForTransaction(data = {}, transaction = {}) {
  const previous = (data.houseContributions || []).find(item => item.linkedTransactionId === transaction.id);
  const shouldLink = transaction.type === "expense" && transaction.linkedHouseId;
  const houseContributions = shouldLink
    ? [
        ...(data.houseContributions || []).filter(item => item.linkedTransactionId !== transaction.id),
        createContributionFromTransaction(transaction, previous)
      ]
    : (data.houseContributions || []).filter(item => item.linkedTransactionId !== transaction.id);

  return { ...data, houseContributions };
}

export function removeHouseContributionForTransaction(data = {}, transactionId) {
  return {
    ...data,
    houseContributions: (data.houseContributions || []).filter(item => item.linkedTransactionId !== transactionId)
  };
}

export function calculateHouseSummary(data = {}, house = {}) {
  const contributions = (data.houseContributions || []).filter(item => item.houseId === house.id);
  const people = (data.housePeople || []).filter(item => item.houseId === house.id);
  const splits = (data.houseOwnershipSplits || []).filter(item => item.houseId === house.id);
  const totalContributed = sum(contributions.map(item => item.amount));
  const byPersonMap = new Map();

  contributions.forEach(item => {
    const person = people.find(candidate => candidate.id === item.personId);
    const key = item.personId || item.personName || "unknown";
    const label = person?.name || item.personName || "Unassigned";
    const existing = byPersonMap.get(key) || { key, personId: item.personId || null, name: label, amount: 0, percentage: 0 };
    existing.amount += Number(item.amount || 0);
    byPersonMap.set(key, existing);
  });

  const byPerson = [...byPersonMap.values()]
    .map(item => ({ ...item, percentage: totalContributed > 0 ? (item.amount / totalContributed) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const byType = Object.fromEntries(HOUSE_CONTRIBUTION_TYPES.map(([key]) => [key, sum(contributions.filter(item => item.type === key).map(item => item.amount))]));
  const externalTotal = sum(contributions.filter(item => item.sourceType === "external").map(item => item.amount));
  const linkedTotal = sum(contributions.filter(item => item.sourceType === "linkedTransaction").map(item => item.amount));
  const manualTotal = sum(contributions.filter(item => item.sourceType === "manualAdjustment").map(item => item.amount));
  const propertyValue = Number(house.propertyValue || 0);
  const mortgageBalance = Number(house.mortgage?.currentBalance || 0);
  const manualTotalPercentage = sum(splits.map(item => item.percentage));

  return {
    contributions,
    people,
    splits,
    byPerson,
    byType,
    totalContributed,
    depositTotal: byType.deposit || 0,
    mortgagePaymentTotal: byType.mortgagePayment || 0,
    mortgageOverpaymentTotal: byType.mortgageOverpayment || 0,
    houseCostTotal: totalContributed - (byType.deposit || 0) - (byType.mortgagePayment || 0) - (byType.mortgageOverpayment || 0),
    externalTotal,
    linkedTotal,
    manualTotal,
    propertyValue,
    mortgageBalance,
    estimatedEquity: propertyValue - mortgageBalance,
    manualTotalPercentage,
    manualSplitValid: Math.abs(manualTotalPercentage - 100) < 0.01
  };
}

export function calculateHousesSummary(data = {}) {
  const houses = (data.houses || []).map(normaliseHouseRecord);
  const activeHouses = houses.filter(house => house.status !== "archived" && !house.archived);
  const summaries = houses.map(house => ({ house, summary: calculateHouseSummary(data, house) }));
  return {
    houses,
    activeHouses,
    summaries,
    totalHouseValue: sum(activeHouses.map(house => house.propertyValue)),
    totalMortgageBalance: sum(activeHouses.map(house => house.mortgage?.currentBalance)),
    totalContributed: sum(summaries.filter(item => activeHouses.some(house => house.id === item.house.id)).map(item => item.summary.totalContributed)),
    totalEquity: sum(activeHouses.map(house => Number(house.propertyValue || 0) - Number(house.mortgage?.currentBalance || 0)))
  };
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
