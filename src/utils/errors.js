// Turns any thrown error into a message a person can act on: what went
// wrong and what to do next. Raw technical text (stack traces, JSON, HTTP
// codes, "Failed to fetch") is never shown as-is.

export class UserFacingError extends Error {
  constructor(message, { kind = "unknown", status = null, cause = null } = {}) {
    super(message);
    this.name = "UserFacingError";
    this.kind = kind;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

export const OFFLINE_MESSAGE = "You're offline, so this couldn't be done. Check your internet connection and try again.";
export const TIMEOUT_MESSAGE = "The cloud service took too long to reply. Check your connection and try again.";

// Known messages from Supabase and the browser, reworded.
const KNOWN_MESSAGES = [
  [/invalid login credentials/i, "That email or username and password don't match. Check them and try again."],
  [/email not confirmed/i, "Your email address hasn't been confirmed yet. Open the link in the confirmation email, then sign in."],
  [/user already registered|already been registered/i, "There's already an account for that email address. Sign in instead, or reset your password."],
  [/password should be at least|weak password/i, "That password is too weak. Use at least 8 characters, including a letter and a number."],
  [/jwt expired|invalid jwt|token.*expired|refresh token/i, "Your sign-in has expired. Sign in again to continue."],
  [/rate limit|too many requests/i, "Too many attempts in a short time. Wait a minute, then try again."],
  [/failed to fetch|networkerror|load failed|network request failed/i, OFFLINE_MESSAGE],
  [/quota.*exceeded|quotaexceedederror/i, "This browser has run out of storage space for the app. Export a backup, then free up space (for example by removing old receipts) and try again."]
];

// Text that is clearly for developers rather than people.
const TECHNICAL_PATTERN = /[{}<>]|\bundefined\b|\bnull\b|cannot read|is not a function|unexpected token|syntaxerror|typeerror|status \d{3}|\bpgrst\d+|\bsqlstate\b|stack/i;

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function getErrorMessage(error, fallback = "That didn't work. Try again in a moment.") {
  if (error instanceof UserFacingError) return error.message;
  if (isOffline()) return OFFLINE_MESSAGE;

  const raw = String(error?.message || error || "").trim();
  if (!raw) return fallback;

  const known = KNOWN_MESSAGES.find(([pattern]) => pattern.test(raw));
  if (known) return known[1];

  if (TECHNICAL_PATTERN.test(raw) || raw.length > 300) return fallback;
  return raw;
}

// Maps an HTTP status from the cloud service to a plain-English error, or
// null when the server's own message should be used.
export function describeHttpStatus(status) {
  if (status === 401 || status === 403) {
    return new UserFacingError("Your sign-in has expired or doesn't have access to this. Sign in again, then try once more.", { kind: "auth", status });
  }
  if (status === 404) {
    return new UserFacingError("That item couldn't be found in the cloud. It may have been deleted on another device. Refresh the list and try again.", { kind: "not_found", status });
  }
  if (status === 408 || status === 504) {
    return new UserFacingError(TIMEOUT_MESSAGE, { kind: "timeout", status });
  }
  if (status === 429) {
    return new UserFacingError("Too many requests in a short time. Wait a minute, then try again.", { kind: "rate_limit", status });
  }
  if (status >= 500) {
    return new UserFacingError("The cloud service is having problems right now. Your local data is safe — try again in a few minutes.", { kind: "server", status });
  }
  return null;
}
