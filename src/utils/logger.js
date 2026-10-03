/* eslint-disable no-console -- this file is the app's one route to the console. */

// The only place the app writes to the browser console. Messages are kept
// for real failures (mostly saving and loading data) so problems can be
// investigated from the browser's developer tools; nothing is shown to the
// person using the app from here.
const PREFIX = "[GH Budgeting]";

export function logError(context, ...details) {
  console.error(`${PREFIX} ${context}`, ...details);
}

export function logWarning(context, ...details) {
  console.warn(`${PREFIX} ${context}`, ...details);
}
