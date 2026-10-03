import { FieldError } from "../common/FormFeedback.jsx";
import { ColumnSelect } from "./ColumnSelect.jsx";

// The CSV files chosen for this import, each with its account and an
// expandable column mapping.
export function UploadFileList({ uploadItems, activeAccounts, expandedMappingId, updateUploadItem, updateUploadItemMap, toggleMapping, removeUploadItem }) {
  return (
    <div className="archive-list">
      {uploadItems.map(item => {
        const account = activeAccounts.find(accountItem => accountItem.id === item.accountId);
        const expanded = expandedMappingId === item.id;
        return (
          <div key={item.id} className="archive-row">
            <div>
              <strong>{item.fileName}</strong>
              {item.error
                ? <FieldError fieldId={`csv-file-${item.id}`} message={item.error} />
                : <small>{`${item.rows.length} row${item.rows.length === 1 ? "" : "s"} · ${account?.name || "No account selected"}`}</small>}
            </div>
            <div className="archive-row-actions">
              {!item.error && <select value={item.accountId} onChange={event => updateUploadItem(item.id, "accountId", event.target.value)}>
                {activeAccounts.map(accountOption => <option key={accountOption.id} value={accountOption.id}>{accountOption.name}</option>)}
              </select>}
              <button type="button" className="secondary-button small" onClick={() => toggleMapping(item.id)}>
                {expanded ? "Hide mapping" : "Check mapping"}
              </button>
              <button type="button" className="secondary-button small" onClick={() => removeUploadItem(item.id)}>Remove</button>
            </div>
            {!item.error && expanded && (
              <div className="import-mapping-dropdown">
                <div className="form-grid import-map-grid">
                  <ColumnSelect label="Date" field="date" value={item.columnMap.date} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} required />
                  <ColumnSelect label="Time" field="time" value={item.columnMap.time} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                  <ColumnSelect label="Description" field="description" value={item.columnMap.description} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} required />
                  <ColumnSelect label="Signed amount" field="amount" value={item.columnMap.amount} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                  <ColumnSelect label="Paid in" field="paidIn" value={item.columnMap.paidIn} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                  <ColumnSelect label="Paid out" field="paidOut" value={item.columnMap.paidOut} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                  <ColumnSelect label="Balance / closing balance" field="balance" value={item.columnMap.balance} headers={item.headers} update={(field, value) => updateUploadItemMap(item.id, field, value)} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
