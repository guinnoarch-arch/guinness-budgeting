// Repeat settings for a recurring transaction.
export function RecurringOptions({ form, update }) {
  return (
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
  );
}
