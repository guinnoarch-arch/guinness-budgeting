import { formatAccountType } from "./accountDisplay.js";
import { calculateAccountBalance } from "../../utils/calculations.js";
import { formatMoney } from "../../utils/money.js";
import { getAccountDeleteBlocker } from "../../services/accountService.js";

// Archived accounts, with restore and delete.
export function ArchivedAccountsCard({ appData, archivedAccounts, deleteAccount, restoreAccount }) {
  return (
    <section className="card archived-card">
      <div className="section-header compact-header">
        <div>
          <h3>Archived accounts</h3>
        </div>
      </div>
      {archivedAccounts.length === 0 ? (
        <p className="muted">No archived accounts. Archive an account from Edit account when you close it, and it'll move here.</p>
      ) : (
        <div className="archive-list">
          {archivedAccounts.map(account => {
            const deleteBlocker = getAccountDeleteBlocker(appData, account);
            return (
              <div key={account.id} className="archive-row">
                <div>
                  <strong>{account.name}</strong>
                  <small>{formatAccountType(account.type)} · balance {formatMoney(calculateAccountBalance(appData, account.id))}</small>
                  {deleteBlocker && <small>{deleteBlocker}</small>}
                </div>
                <div className="row-actions archive-row-actions">
                  <button type="button" className="secondary-button" onClick={() => restoreAccount(account)}>Restore</button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => deleteAccount(account)}
                    disabled={Boolean(deleteBlocker)}
                    title={deleteBlocker || undefined}
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
