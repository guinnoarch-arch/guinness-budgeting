// Formatting shared by the Control Centre panels.
import { formatDateTime as formatDateTimeOr } from "../../utils/dates.js";

export function formatDateTime(value) {
  return formatDateTimeOr(value, "Not recorded");
}

export function isMissingAdminSqlError(message = "") {
  return /admin sql setup has not been run yet|gh_admin_list_users|schema cache|function .*not found|could not find the function/i.test(String(message || ""));
}
