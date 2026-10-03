import { useState } from "react";
import { createId } from "../../utils/ids.js";
import { calculateMonthSummary } from "../../utils/calculations.js";
import { formatMonthLabel } from "../../utils/dates.js";
import { formatMoney } from "../../utils/money.js";

export default function MonthCloseSection({ appData, actions, selectedMonth, settings, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [monthCloseMode, setMonthCloseMode] = useState("carry");
  const [monthCloseSavings, setMonthCloseSavings] = useState("");
  const monthSummary = calculateMonthSummary(appData, selectedMonth);
  const existingClosedMonth = (appData.closedMonths || []).find(item => item.month === selectedMonth);

  function closeSelectedMonth() {
    if (existingClosedMonth && !confirm("This month is already closed. Replace the existing closed-month record?")) return;
    const leftover = monthSummary.netMoneyLeft;
    const savingsAmount = monthCloseMode === "savings"
      ? Math.max(0, leftover)
      : monthCloseMode === "split"
        ? Math.max(0, Number(monthCloseSavings || 0))
        : 0;
    const carriedForward = monthCloseMode === "zero" ? 0 : Math.max(0, leftover - savingsAmount);
    const now = new Date().toISOString();
    const record = {
      id: existingClosedMonth?.id || createId("closed"),
      month: selectedMonth,
      income: monthSummary.income,
      expenses: monthSummary.expenses,
      savingsTransfers: monthSummary.savingsTransfers,
      carriedForward,
      movedToSavings: savingsAmount,
      excludedSpending: monthSummary.excludedSpending,
      closedAt: now,
      updatedAt: now,
      isExample: Boolean(settings.useExampleData)
    };
    actions.updateAppData({
      ...appData,
      closedMonths: [record, ...(appData.closedMonths || []).filter(item => item.month !== selectedMonth)]
    }, { reason: `Month closed: ${selectedMonth}`, major: true });
    actions.notify(`${formatMonthLabel(selectedMonth)} closed. ${formatMoney(carriedForward)} carried forward${savingsAmount ? `, ${formatMoney(savingsAmount)} recorded as moved to savings` : ""}.`);
  }

  return (
    <section className={sectionClass("monthClose", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("monthClose")}>
        <div>
          <h3>Month close assistant</h3>
        </div>
        <SectionChevron sectionId="monthClose" />
      </div>
      {activeSettingsSection === "monthClose" && (
        <div className="form-section-card">
          <div className="profile-meta-grid">
            <p><span>Month</span><strong>{selectedMonth}</strong></p>
            <p><span>Income</span><strong>{formatMoney(monthSummary.income)}</strong></p>
            <p><span>Spending</span><strong>{formatMoney(monthSummary.expenses)}</strong></p>
            <p><span>Excluded spending</span><strong>{formatMoney(monthSummary.excludedSpending)}</strong></p>
            <p><span>Savings transfers</span><strong>{formatMoney(monthSummary.savingsTransfers)}</strong></p>
            <p><span>Net leftover</span><strong>{formatMoney(monthSummary.netMoneyLeft)}</strong></p>
          </div>
          {existingClosedMonth && <p className="backup-warning-box">This month is already closed. Confirming will replace the existing closed-month record.</p>}
          <div className="form-grid">
            <label>Leftover decision<select value={monthCloseMode} onChange={event => setMonthCloseMode(event.target.value)}>
              <option value="carry">Carry forward leftover</option>
              <option value="savings">Move all leftover to savings</option>
              <option value="split">Split carry-forward and savings</option>
              <option value="zero">Set leftover to zero</option>
            </select></label>
            {monthCloseMode === "split" && <label>Move to savings<input type="number" min="0" step="0.01" value={monthCloseSavings} onChange={event => setMonthCloseSavings(event.target.value)} /></label>}
          </div>
          <button type="button" className="primary-button" onClick={closeSelectedMonth}>Confirm close month</button>
        </div>
      )}
    </section>
  );
}
