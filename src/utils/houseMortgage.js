// Turns a House (and shared-house data from the cloud) into the shapes the
// Loans page and mortgage panels display.
import { todayIsoDate } from "./dates.js";
import { normaliseHouseRecord } from "./houseTracking.js";

export function buildSharedHouseData(bundles = []) {
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

export function mergeHouseDisplayData(appData, sharedData) {
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

export function buildMortgageLoanFromHouse(house, appData = {}) {
  const linkedLoan = (appData.loans || []).find(loan => loan.id === house.linkedLoanId) || {};
  const legacyDetails = linkedLoan.mortgageDetails || {};
  const mortgage = house.mortgage || {};
  const balanceDate = linkedLoan.balanceDate || mortgage.balanceDate || house.updatedAt?.slice(0, 10) || todayIsoDate();
  const termYears = Number(mortgage.termYears || legacyDetails.termYears || 0);
  const remainingTermMonths = Number(mortgage.remainingTermMonths || legacyDetails.remainingTermMonths || termYears * 12 || 0);

  return {
    ...linkedLoan,
    id: house.linkedLoanId || `house_mortgage_${house.id}`,
    houseId: house.id,
    type: "mortgage",
    name: linkedLoan.name || `${house.name} mortgage`,
    originalAmount: Number(mortgage.originalAmount || linkedLoan.originalAmount || 0),
    currentBalance: Number(mortgage.currentBalance || linkedLoan.currentBalance || 0),
    balanceDate,
    startDate: mortgage.startDate || linkedLoan.startDate || house.purchaseDate || null,
    notes: mortgage.notes || linkedLoan.notes || "",
    mortgageDetails: {
      ...legacyDetails,
      repaymentType: mortgage.repaymentType || legacyDetails.repaymentType || "repayment",
      termYears,
      remainingTermMonths,
      monthlyPayment: Number(mortgage.monthlyPayment || legacyDetails.monthlyPayment || 0),
      paymentDay: Number(mortgage.paymentDay || legacyDetails.paymentDay || 1),
      interestType: mortgage.rateType || legacyDetails.interestType || "fixed",
      currentRate: Number(mortgage.interestRate || legacyDetails.currentRate || 0),
      fixedUntil: mortgage.fixedEndDate || legacyDetails.fixedUntil || null,
      followOnRate: Number(mortgage.followOnRate || legacyDetails.followOnRate || 0),
      plannedMonthlyOverpayment: Number(mortgage.plannedMonthlyOverpayment || legacyDetails.plannedMonthlyOverpayment || 0),
      overpaymentAllowancePercent: Number(mortgage.overpaymentAllowancePercent ?? legacyDetails.overpaymentAllowancePercent ?? 10),
      earlyRepaymentChargeApplies: Boolean(mortgage.earlyRepaymentChargeApplies ?? legacyDetails.earlyRepaymentChargeApplies),
      propertyValue: Number(house.propertyValue || legacyDetails.propertyValue || 0),
      linkedAccountId: mortgage.linkedAccountId || legacyDetails.linkedAccountId || null
    }
  };
}

export function buildHouseMortgageAppData(appData = {}, house, mortgageLoan) {
  const transactions = (appData.transactions || []).map(transaction => {
    const isHouseMortgagePayment = transaction.linkedHouseId === house.id
      && ["mortgagePayment", "mortgageOverpayment"].includes(transaction.houseContributionType || (transaction.isLoanOverpayment ? "mortgageOverpayment" : ""));
    if (!isHouseMortgagePayment || transaction.linkedLoanId) return transaction;
    return {
      ...transaction,
      linkedLoanId: mortgageLoan.id
    };
  });

  const loans = [
    mortgageLoan,
    ...(appData.loans || []).filter(loan => loan.id !== mortgageLoan.id)
  ];

  return {
    ...appData,
    loans,
    transactions
  };
}
