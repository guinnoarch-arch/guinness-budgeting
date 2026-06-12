import { useMemo, useState } from "react";
import {
  getStoredCloudSessionSummary,
  isCloudBackupConfigured,
  refreshSupabaseCloudSession
} from "../../services/cloudBackupService.js";
import {
  ensureProfileForSignedInUser,
  normaliseEmail,
  normaliseUsername,
  signInWithEmailOrUsername,
  signUpWithEmail,
  validateEmail,
  validatePassword,
  validateSignInPassword,
  validateUsername
} from "../../services/authService.js";

function cloudConfigFromData(appData, form) {
  const current = appData?.settings?.cloudBackup || {};
  const username = normaliseUsername(form.username || current.cloudUsername || "");
  const email = normaliseEmail(form.email || current.cloudUserEmail || "");
  return {
    ...current,
    provider: "supabase",
    mode: current.mode || "auto-cloud-backup",
    enabled: true,
    requireLoginBeforeData: true,
    supabaseUrl: "",
    supabaseAnonKey: "",
    tableName: current.tableName || "gh_cloud_backups",
    cloudUserEmail: email,
    cloudUsername: username,
    lastCloudError: null,
    version: current.version || "1"
  };
}

export default function CloudLoginGate({ appData, actions, cloudAuthSummary, onAuthChanged, phoneMode = false, onTogglePhoneMode }) {
  const settings = appData?.settings || {};
  const cloud = settings.cloudBackup || {};
  const [mode, setMode] = useState("sign-in");
  const [form, setForm] = useState(() => ({
    email: "",
    loginIdentifier: "",
    username: "",
    password: "",
    confirmPassword: ""
  }));
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const configured = useMemo(() => {
    const nextCloud = cloudConfigFromData(appData, form);
    return isCloudBackupConfigured({ ...settings, cloudBackup: nextCloud });
  }, [appData, form, settings]);

  const session = cloudAuthSummary || getStoredCloudSessionSummary(settings);
  const storedUserId = cloud.cloudUserId || null;
  const wrongAccount = Boolean(storedUserId && session?.user?.id && storedUserId !== session.user.id);
  const emailIssue = mode === "create" ? validateEmail(form.email) : "";
  const usernameIssue = mode === "create" ? validateUsername(form.username) : "";
  const passwordIssue = mode === "create"
    ? validatePassword(form.password, form.confirmPassword)
    : validateSignInPassword(form.password);

  async function saveCloudSettings(patch = {}) {
    const baseCloud = cloudConfigFromData(appData, form);
    const nextCloud = {
      ...baseCloud,
      ...patch,
      supabaseUrl: "",
      supabaseAnonKey: "",
      requireLoginBeforeData: true,
      enabled: true,
      lastCloudError: patch.lastCloudError ?? null
    };

    actions.updateAppData(prev => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        cloudBackup: nextCloud
      }
    }), { reason: "Cloud login settings changed", markDirty: false });

    return nextCloud;
  }

  async function handleAuth() {
    if (!configured || emailIssue || usernameIssue || passwordIssue) {
      setStatus(!configured ? "Cloud login is not configured for this build." : emailIssue || usernameIssue || passwordIssue);
      return;
    }

    setIsBusy(true);
    setStatus(mode === "create" ? "Creating account..." : "Signing in...");
    try {
      const username = normaliseUsername(form.username);
      const email = normaliseEmail(form.email);
      const nextCloud = await saveCloudSettings({
        cloudUserEmail: email,
        cloudUsername: username,
        lastCloudError: null
      });
      const sessionResult = mode === "create"
        ? await signUpWithEmail({ ...settings, cloudBackup: nextCloud }, { email, username, password: form.password, confirmPassword: form.confirmPassword })
        : await signInWithEmailOrUsername({ ...settings, cloudBackup: nextCloud }, form.loginIdentifier, form.password);

      setForm(prev => ({ ...prev, password: "", confirmPassword: "" }));

      if (sessionResult.pendingEmailConfirmation) {
        setStatus("Account created. Check your email if Supabase confirmation is enabled, then sign in.");
      } else {
        const profileUsername = username || sessionResult.user?.user_metadata?.username || appData?.profile?.username || "";
        await ensureProfileForSignedInUser({ ...settings, cloudBackup: nextCloud }, sessionResult, profileUsername).catch(() => null);
        await saveCloudSettings({
          ...nextCloud,
          cloudUserId: sessionResult.user?.id || nextCloud.cloudUserId || null,
          cloudUserEmail: sessionResult.user?.email || email,
          cloudUsername: normaliseUsername(profileUsername),
          lastSignedInAt: new Date().toISOString(),
          cloudBackupNeeded: Boolean(!nextCloud.linkedLocalDataAt),
          lastCloudError: null
        });
        setStatus("Signed in. Opening app...");
      }
      onAuthChanged?.();
    } catch (error) {
      const message = error.message || "Authentication failed.";
      setStatus(message);
      await saveCloudSettings({ lastCloudError: message });
      onAuthChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefreshSession() {
    setIsBusy(true);
    setStatus("Refreshing session...");
    try {
      const nextCloud = await saveCloudSettings({
        cloudUserEmail: normaliseEmail(form.email),
        cloudUsername: normaliseUsername(form.username),
        lastCloudError: null
      });
      await refreshSupabaseCloudSession({ ...settings, cloudBackup: nextCloud });
      setStatus("Session refreshed. Opening app...");
      onAuthChanged?.();
    } catch (error) {
      setStatus(error.message || "Could not refresh session. Sign in again.");
      onAuthChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className={`login-gate-page ${phoneMode ? "phone-mode" : ""}`.trim()}>
      <section className="card login-gate-card">
        <div className="auth-compact-toggle-row">
          <button
            type="button"
            className={`secondary-button phone-mode-toggle ${phoneMode ? "active" : ""}`}
            onClick={onTogglePhoneMode}
            aria-pressed={phoneMode}
          >
            {phoneMode ? "Desktop view" : "Phone view"}
          </button>
        </div>

        <div className="login-gate-brand">
          <div className="brand-icon large"><img src="/icons/gb-icon-192.png" alt="" /></div>
          <div>
            <p className="eyebrow">Guinness & Holley Budgeting</p>
            <h1>Sign in to open your budget</h1>
            <p className="muted-text">Sign in to open your private local budget and cloud backup tools.</p>
          </div>
        </div>

        {!configured && (
          <div className="backup-warning-box danger-box">
            <strong>Cloud login is not configured for this build.</strong>
            <span>Ask the app owner to enable cloud login for this deployment.</span>
          </div>
        )}

        <div className="row-actions cloud-action-row">
          <button type="button" className={mode === "sign-in" ? "primary-button" : "secondary-button"} onClick={() => setMode("sign-in")}>Sign in</button>
          <button type="button" className={mode === "create" ? "primary-button" : "secondary-button"} onClick={() => setMode("create")}>Create account</button>
        </div>

        <div className="cloud-setup-grid login-gate-grid">
          {mode === "create" ? (
            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
          ) : (
            <label>
              Email or username
              <input
                value={form.loginIdentifier}
                onChange={event => setForm(prev => ({ ...prev, loginIdentifier: event.target.value }))}
                placeholder="you@example.com or yourusername"
                autoComplete="username"
              />
            </label>
          )}
          {mode === "create" && (
            <label>
              Username
              <input
                value={form.username}
                onChange={event => setForm(prev => ({ ...prev, username: event.target.value }))}
                placeholder="guinness"
                autoComplete="username"
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
              placeholder="At least 8 characters"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
            />
          </label>
          {mode === "create" && (
            <label>
              Confirm password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={event => setForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                placeholder="Repeat password"
                autoComplete="new-password"
              />
            </label>
          )}
        </div>

        <div className="row-actions cloud-action-row">
          <button type="button" className="primary-button" onClick={handleAuth} disabled={isBusy || !configured}>
            {mode === "create" ? "Create account" : "Sign in"}
          </button>
          {session.signedIn && session.tokenExpired && !session.appExpired && (
            <button type="button" className="secondary-button" onClick={handleRefreshSession} disabled={isBusy || !configured}>Refresh session</button>
          )}
        </div>

        {wrongAccount && (
          <div className="backup-warning-box danger-box">
            <strong>Different Supabase account signed in</strong>
            <span>Sign in with the cloud account already linked to this local budget data.</span>
          </div>
        )}

        {status && <p className="cloud-status-message">{status}</p>}

      </section>
    </main>
  );
}
