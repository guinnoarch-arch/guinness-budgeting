

export function ColumnSelect({ label, field, value, headers, update, required = false }) {
  return (
    <label>
      {label}{required ? " *" : ""}
      <select value={value || ""} onChange={event => update(field, event.target.value)}>
        <option value="">Not mapped</option>
        {headers.map(header => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  );
}
