// Fixed values and remembered preferences for the CSV import page.

export const ADD_ACCOUNT_VALUE = "__add_account__";

export const emptyColumnMap = {
  date: "",
  time: "",
  description: "",
  amount: "",
  paidIn: "",
  paidOut: "",
  balance: ""
};

export const emptyAccountForm = {
  name: "",
  type: "current",
  openingBalance: "0"
};

export const previewFilters = [
  ["all", "All"],
  ["needs_review", "Needs review"],
  ["unticked", "Unticked"],
  ["duplicates", "Duplicates"],
  ["transfers", "Transfers"],
  ["matched", "Matched"],
  ["new", "New"]
];

const TRUST_CSV_STORAGE_KEY = "gb.csvImport.trustCsvBalance";

// "The CSV is always right" is the default: on import, any gap between the
// app's calculated balance and the bank's is closed with dated adjustments.
// Remembered per browser so turning it off sticks.
export function readTrustCsvPreference() {
  try {
    const stored = window.localStorage.getItem(TRUST_CSV_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function writeTrustCsvPreference(value) {
  try {
    window.localStorage.setItem(TRUST_CSV_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Storage blocked — the choice just won't be remembered.
  }
}
