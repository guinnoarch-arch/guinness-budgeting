import { transactionMatchesAccount } from "../../utils/calculations.js";
import { signedMoney } from "../../utils/money.js";

export default function RecentTransactionsPanel({ appData, accountId = null, onEdit }) {
  const recent = [...appData.transactions]
    .filter(transaction => transactionMatchesAccount(transaction, accountId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <section className="card">
      <h3>Recent transactions</h3>
      {recent.length === 0 ? (
        <p className="muted">No recent transactions for this account view.</p>
      ) : (
        <div className="stack">
          {recent.map(txn => (
            <button key={txn.id} className="transaction-mini-row" onClick={() => onEdit(txn)}>
              <span>
                <strong>{txn.title}</strong>
                <small>{txn.date}</small>
              </span>
              <span className={`amount ${txn.type}`}>{signedMoney(txn.amount, txn.type)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
