import {
  resolveSupabaseUsernameLogin,
  signInToSupabaseCloud,
  signUpToSupabaseCloud,
  upsertSupabaseProfile
} from "./cloudBackupService.js";

export function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normaliseUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function getDisplayUsernameFromSession(sessionOrSummary) {
  const user = sessionOrSummary?.user || sessionOrSummary || null;
  return user?.user_metadata?.username
    || user?.user_metadata?.display_username
    || user?.email
    || "Cloud user";
}

export function validateEmail(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) return "Enter a valid email address.";
  return "";
}

export function normaliseLoginIdentifier(value) {
  return String(value || "").trim();
}

export function validateUsername(username) {
  const normalised = normaliseUsername(username);
  if (!normalised) return "Enter a username.";
  if (normalised.length < 3) return "Username must be at least 3 characters.";
  if (normalised.length > 30) return "Username must be 30 characters or fewer.";
  if (!/^[a-z0-9._-]+$/.test(normalised)) {
    return "Use letters, numbers, dots, hyphens or underscores only.";
  }
  return "";
}

export function validatePassword(password, confirmPassword = null) {
  const text = String(password || "");
  if (text.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/i.test(text) || !/[0-9]/.test(text)) {
    return "Password must include at least one letter and one number.";
  }
  if (confirmPassword !== null && text !== String(confirmPassword || "")) {
    return "Passwords do not match.";
  }
  return "";
}

export function validateSignInPassword(password) {
  if (!String(password || "")) return "Enter your password.";
  return "";
}

export async function signInWithEmail(settings, email, password) {
  const emailIssue = validateEmail(email);
  if (emailIssue) throw new Error(emailIssue);
  const passwordIssue = validateSignInPassword(password);
  if (passwordIssue) throw new Error(passwordIssue);
  return signInToSupabaseCloud(settings, normaliseEmail(email), password);
}

export async function signInWithEmailOrUsername(settings, identifier, password) {
  const login = normaliseLoginIdentifier(identifier);
  if (!login) throw new Error("Enter your email address or username.");
  const passwordIssue = validateSignInPassword(password);
  if (passwordIssue) throw new Error(passwordIssue);

  if (login.includes("@")) {
    return signInWithEmail(settings, login, password);
  }

  const username = normaliseUsername(login);
  const usernameIssue = validateUsername(username);
  if (usernameIssue) throw new Error(usernameIssue);
  let resolvedEmail = null;
  try {
    resolvedEmail = await resolveSupabaseUsernameLogin(settings, username);
  } catch (error) {
    throw new Error("Username lookup is not available. Try your email address instead.");
  }
  if (!resolvedEmail) {
    throw new Error("No account found with that username. Try your email address instead.");
  }
  return signInToSupabaseCloud(settings, resolvedEmail, password);
}

export async function signUpWithEmail(settings, { email, username, password, confirmPassword }) {
  const emailIssue = validateEmail(email);
  if (emailIssue) throw new Error(emailIssue);
  const usernameIssue = validateUsername(username);
  if (usernameIssue) throw new Error(usernameIssue);
  const passwordIssue = validatePassword(password, confirmPassword);
  if (passwordIssue) throw new Error(passwordIssue);

  const usernameNormalised = normaliseUsername(username);
  const existingEmail = await resolveSupabaseUsernameLogin(settings, usernameNormalised).catch(() => null);
  if (existingEmail) {
    throw new Error("That username is already taken. Choose another username.");
  }

  const sessionOrPending = await signUpToSupabaseCloud(settings, normaliseEmail(email), password, {
    username: String(username || "").trim(),
    display_username: String(username || "").trim(),
    username_normalized: usernameNormalised
  });

  if (!sessionOrPending.pendingEmailConfirmation && sessionOrPending.user?.id) {
    await upsertSupabaseProfile(settings, {
      id: sessionOrPending.user.id,
      email: sessionOrPending.user.email || normaliseEmail(email),
      username: String(username || "").trim()
    }).catch(error => {
      throw new Error(error.message?.includes("duplicate") ? "That username is already taken. Choose another username." : error.message || "Account was created but the profile could not be saved.");
    });
  }

  return sessionOrPending;
}

export async function ensureProfileForSignedInUser(settings, session, preferredUsername = "") {
  if (!session?.user?.id) return null;
  const username = String(preferredUsername || session.user.user_metadata?.username || session.user.email?.split("@")?.[0] || "").trim();
  if (!username) return null;
  return upsertSupabaseProfile(settings, {
    id: session.user.id,
    email: session.user.email,
    username
  });
}
