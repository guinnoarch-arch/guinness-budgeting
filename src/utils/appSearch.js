// Results for the header search box: pages, accounts and transactions.

export function buildSearchResults(appData, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const includes = (value) => String(value || "").toLowerCase().includes(needle);
  const rows = [];
  (appData.transactions || []).forEach(item => {
    if ([item.title, item.note, item.date].some(includes)) rows.push({ type: "Transaction", label: item.title || "Transaction", detail: item.date, page: "transactions" });
  });
  (appData.accounts || []).forEach(item => {
    if ([item.name, item.type].some(includes)) rows.push({ type: "Account", label: item.name, detail: item.type, page: "accounts" });
  });
  (appData.categories || []).forEach(item => {
    if ([item.name, item.group].some(includes)) rows.push({ type: "Category", label: item.name, detail: item.group, page: "budgets" });
  });
  (appData.recurringItems || []).forEach(item => {
    if ([item.name, item.notes].some(includes)) rows.push({ type: "Bill", label: item.name, detail: item.nextDueDate, page: "bills" });
  });
  (appData.savingsGoals || []).forEach(item => {
    if ([item.name, item.notes].some(includes)) rows.push({ type: "Saving", label: item.name, detail: "Savings goal", page: "savings" });
  });
  (appData.houses || []).forEach(item => {
    if ([item.name, item.addressLabel, item.notes, item.agreementNotes].some(includes)) rows.push({ type: "House", label: item.name, detail: item.addressLabel, page: "loans" });
  });
  (appData.houseContributions || []).forEach(item => {
    if ([item.personName, item.notes, item.type].some(includes)) rows.push({ type: "House contribution", label: item.personName || item.type, detail: item.date, page: "loans" });
  });
  return rows.slice(0, 30);
}
