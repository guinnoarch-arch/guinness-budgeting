// Calculations behind the mortgage balance chart: past balances from linked
// payments, projected future balances, and a compressed timeline axis.
import { addMonthsToIsoDate, formatIsoDateLocal, parseIsoDateLocal, todayIsoDate } from "./dates.js";

export function buildMortgageChartData(loan, estimate, transactions = [], suppliedProgress = null) {
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
    dateLabel: isSameDate(currentDate, todayIsoDate()) ? `Today · ${formatChartDateLong(currentDate)}` : formatChartDateLong(currentDate),
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

export function getMortgageProgressSnapshot(loan, transactions = []) {
  const originalAmount = Number(loan.originalAmount || loan.currentBalance || 0);
  const baseBalance = Number(loan.currentBalance || 0);
  const baseDate = normaliseDate(loan.balanceDate) || todayIsoDate();
  const startDate = normaliseDate(loan.startDate) || baseDate;
  const todayDate = todayIsoDate();
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
  const startDate = normaliseDate(currentDate) || todayIsoDate();

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

export function getFinalProjectedTotalPaid(chartData) {
  const projectedPoints = [...(chartData || [])]
    .filter(point => Number.isFinite(Number(point.totalPaidProjected)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (projectedPoints.length === 0) return null;
  return Number(projectedPoints[projectedPoints.length - 1].totalPaidProjected);
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

export function roundAxisValue(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
