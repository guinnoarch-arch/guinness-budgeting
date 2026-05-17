import { deleteTransaction } from "../../services/transactionService.js";
import { signedMoney } from "../../utils/money.js";

export default function TransactionTable({ appData, actions, transactions }) {
  function handleDelete(id) {
    if (!confirm("Delete this transaction?")) return;
    actions.updateAppData(deleteTransaction(appData, id));
  }

  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Title</th>
            <th>Category</th>
            <th>Account</th>
            <th>Amount</th>
            <th>Recurring?</th>
            <th>Receipt</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(txn => {
            const category = appData.categories.find(cat => cat.id === txn.categoryId);
            const account = appData.accounts.find(acc => acc.id === txn.accountId);
            const from = appData.accounts.find(acc => acc.id === txn.fromAccountId);
            const to = appData.accounts.find(acc => acc.id === txn.toAccountId);

            return (
              <tr key={txn.id}>
                <td>{txn.date}</td>
                <td><span className={`pill ${txn.type}`}>{txn.type}</span></td>
                <td>
                  <strong>{txn.title}</strong>
                  {txn.note && <small>{txn.note}</small>}
                </td>
                <td>{category?.name || "-"}</td>
                <td>{txn.type === "transfer" ? `${from?.name} → ${to?.name}` : account?.name}</td>
                <td className={`amount ${txn.type}`}>{signedMoney(txn.amount, txn.type)}</td>
                <td>{txn.isRecurring ? "Yes" : "No"}</td>
                <td className="muted">Soon</td>
                <td>
                  <div className="row-actions">
                    <button className="text-button" onClick={() => actions.openEditTransaction(txn)}>Edit</button>
                    <button className="text-button danger-text" onClick={() => handleDelete(txn.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
