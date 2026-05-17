import { formatMonthLabel, getNextMonthKey, getPreviousMonthKey } from "../../utils/dates.js";

export default function MonthSelector({ selectedMonth, setSelectedMonth }) {
  return (
    <div className="month-selector">
      <button onClick={() => setSelectedMonth(getPreviousMonthKey(selectedMonth))}>‹</button>
      <strong>{formatMonthLabel(selectedMonth)}</strong>
      <button onClick={() => setSelectedMonth(getNextMonthKey(selectedMonth))}>›</button>
    </div>
  );
}
