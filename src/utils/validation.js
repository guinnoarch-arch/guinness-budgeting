// Shared field checks. Each returns an error message, or "" when the value
// is fine. Messages say what's wrong and how to fix it.

const PENCE_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function checkRequiredText(value, whatToEnter) {
  return String(value ?? "").trim() ? "" : `Enter ${whatToEnter}.`;
}

// Amount of money typed into a form. `allowZero` for balances and optional
// starting amounts; `allowNegative` for balances that can be overdrawn.
export function checkMoneyAmount(value, { required = true, allowZero = false, allowNegative = false, example = "12.50" } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return required ? `Enter an amount, for example ${example}.` : "";
  const amount = Number(text);
  if (!Number.isFinite(amount) || !PENCE_PATTERN.test(text.replace(/^\+/, ""))) {
    return `Enter the amount as a number in pounds, for example ${example}.`;
  }
  if (amount < 0 && !allowNegative) return "Enter a positive amount — leave out the minus sign.";
  if (amount === 0 && !allowZero) return "Enter an amount above £0.00.";
  return "";
}

export function checkRequiredDate(value, whatDate = "a date") {
  if (!value) return `Choose ${whatDate}.`;
  return Number.isNaN(new Date(`${value}T00:00:00`).getTime()) ? `Choose ${whatDate} using the date picker.` : "";
}

// Drops the empty entries so the result can be used as an errors object.
export function collectErrors(checks) {
  return Object.fromEntries(Object.entries(checks).filter(([, message]) => message));
}

// Used by both the Accounts page and the "Add account" pop-up on Import.
export function validateAccountForm(values) {
  return collectErrors({
    name: checkRequiredText(values.name, "a name for the account, for example Monzo"),
    openingBalance: checkMoneyAmount(values.openingBalance, { required: false, allowZero: true, allowNegative: true, example: "250.00" })
  });
}
