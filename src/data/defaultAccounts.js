// The built-in current account. Older data and several fallbacks assume it
// exists, so it can be archived but never deleted.
export const DEFAULT_ACCOUNT_ID = "acc_current";

export const defaultAccounts = [
  { id: DEFAULT_ACCOUNT_ID, name: "Current Account", type: "current", openingBalance: 0, isDefault: true, isActive: true },
  { id: "acc_savings", name: "Savings Account", type: "savings", openingBalance: 0, isDefault: true, isActive: true },
  { id: "acc_cash", name: "Cash", type: "cash", openingBalance: 0, isDefault: true, isActive: true }
];
