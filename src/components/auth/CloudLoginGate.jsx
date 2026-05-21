import { useEffect, useMemo, useState } from "react";
import {
  clearStoredCloudSession,
  getStoredCloudSessionSummary,
  getSupabaseSetupSql,
  isCloudBackupConfigured,
  refreshSupabaseCloudSession,
  signInToSupabaseCloud,
  signUpToSupabaseCloud
} from "../../services/cloudBackupService.js";

function normaliseSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

function cloudConfigFromData(appData, form) {
  const current = appData?.settings?.cloudBackup || {};
  return {
    provider: "supabase",
    mode: "manual-cloud-backup",
    enabled: true,
    requireLoginBeforeData: true,
    supabaseUrl: normaliseSupabaseUrl(form.supabaseUrl),
    supabaseAnonKey: String(form.supabaseAnonKey || "").trim(),
    tableName: current.tableName || "gh_cloud_backups",
    cloudUserId: current.cloudUserId || null,
    cloudUserEmail: String(form.email || current.cloudUserEmail || "").trim(),
    lastSignedInAt: current.lastSignedInAt || null,
    lastCloudBackupAt: current.lastCloudBackupAt || null,
    lastCloudBackupId: current.lastCloudBackupId || null,
    lastCloudRestoreAt: current.lastCloudRestoreAt || null,
    lastCloudListAt: current.lastCloudListAt || null,
    lastCloudError: null,
    version: current.version || "1"
  };
}

export default function CloudLoginGate({ appData, actions, cloudAuthSummary, onAuthChanged }) {
  const settings = appData?.settings || {};
  const cloud = settings.cloudBackup || {};
  const [form, setForm] = useState(() => ({
    supabaseUrl: cloud.supabaseUrl || "",
    supabaseAnonKey: cloud.supabaseAnonKey || "",
    email: cloud.cloudUserEmail || appData?.profile?.email || ""
  }));
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [showSql, setShowSql] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const configured = useMemo(() => {
    const nextCloud = cloudConfigFromData(appData, form);
    return isCloudBackupConfigured({ ...settings, cloudBackup: nextCloud });
  }, [appData, form, settings]);

  const session = cloudAuthSummary || getStoredCloudSessionSummary();
  const storedUserId = cloud.cloudUserId || null;
  const wrongAccount = Boolean(storedUserId && session?.user?.id && storedUserId !== session.user.id);

  useEffect(() => {
    setForm(prev => ({
      supabaseUrl: cloud.supabaseUrl || prev.supabaseUrl || "",
      supabaseAnonKey: cloud.supabaseAnonKey || prev.supabaseAnonKey || "",
      email: cloud.cloudUserEmail || appData?.profile?.email || prev.email || ""
    }));
  }, [cloud.supabaseUrl, cloud.supabaseAnonKey, cloud.cloudUserEmail, appData?.profile?.email]);

  async function saveCloudSettings(patch = {}) {
    const baseCloud = cloudConfigFromData(appData, form);
    const nextCloud = {
      ...baseCloud,
      ...patch,
      supabaseUrl: normaliseSupabaseUrl(patch.supabaseUrl ?? baseCloud.supabaseUrl),
      supabaseAnonKey: String((patch.supabaseAnonKey ?? baseCloud.supabaseAnonKey) || "").trim(),
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

  async function handleSaveSettings() {
    const nextCloud = await saveCloudSettings({
      supabaseUrl: form.supabaseUrl,
      supabaseAnonKey: form.supabaseAnonKey,
      cloudUserEmail: form.email,
      lastCloudError: null
    });
    setForm(prev => ({ ...prev, supabaseUrl: nextCloud.supabaseUrl }));
    setStatus(isCloudBackupConfigured({ ...settings, cloudBackup: nextCloud })
      ? "Cloud settings saved. Now sign in or sign up."
      : "Cloud settings saved, but the Supabase URL/key are still not valid.");
  }

  async function handleSignIn() {
    setIsBusy(true);
    setStatus("Signing in...");
    try {
      const nextCloud = await saveCloudSettings({
        supabaseUrl: form.supabaseUrl,
        supabaseAnonKey: form.supabaseAnonKey,
        cloudUserEmail: form.email,
        lastCloudError: null
      });
      const sessionResult = await signInToSupabaseCloud({ ...settings, cloudBackup: nextCloud }, form.email, password);
      await saveCloudSettings({
        ...nextCloud,
        cloudUserId: sessionResult.user?.id || nextCloud.cloudUserId || null,
        cloudUserEmail: sessionResult.user?.email || form.email,
        lastSignedInAt: new Date().toISOString(),
        lastCloudError: null
      });
      setPassword("");
      setStatus("Signed in. Opening app...");
      onAuthChanged?.();
    } catch (error) {
      const message = error.message || "Cloud sign-in failed.";
      setStatus(message);
      await saveCloudSettings({ lastCloudError: message });
      onAuthChanged?.();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignUp() {
    setIsBusy(true);
    setStatus("Creating cloud account...");
    try {
      const nextCloud = await saveCloudSettings({
        supabaseUrl: form.supabaseUrl,
        supabaseAnonKey: form.supabaseAnonKey,
        cloudUserEmail: form.email,
        lastCloudError: null
      });
      const result = await signUpToSupabaseCloud({ ...settings, cloudBackup: nextCloud }, form.email, password);
      setPassword("");

      if (result.pendingEmailConfirmation) {
        setStatus("Sign-up created. Check your email, confirm the account, then sign in here.");
      } else {
        await saveCloudSettings({
          ...nextCloud,
          cloudUserId: result.user?.id || nextCloud.cloudUserId || null,
          cloudUserEmail: result.user?.email || form.email,
          lastSignedInAt: new Date().toISOString(),
          lastCloudError: null
        });
        setStatus("Signed up and signed in. Opening app...");
      }
      onAuthChanged?.();
    } catch (error) {
      const message = error.message || "Cloud sign-up failed.";
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
        supabaseUrl: form.supabaseUrl,
        supabaseAnonKey: form.supabaseAnonKey,
        cloudUserEmail: form.email,
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

  function handleClearSession() {
    clearStoredCloudSession();
    setStatus("Signed out on this browser. Sign in to open the app.");
    onAuthChanged?.();
  }

  return (
    <main className="login-gate-page">
      <section className="card login-gate-card">
        <div className="login-gate-brand">
          <div className="brand-icon large"><img src="/icons/gb-icon-192.png" alt="" /></div>
          <div>
            <p className="eyebrow">Guinness & Holley Budgeting</p>
            <h1>Sign in to open your budget</h1>
            <p className="muted-text">Your finance data is hidden until your Supabase cloud account is signed in on this browser.</p>
          </div>
        </div>

        <div className="backup-warning-box">
          <strong>Login gate enabled</strong>
          <span>This blocks the app interface before any budget data is shown. Local IndexedDB data still stays on this device; keep JSON backups as well.</span>
        </div>

        <div className="cloud-setup-grid login-gate-grid">
          <label>
            Supabase project URL
            <input
              value={form.supabaseUrl}
              onChange={event => setForm(prev => ({ ...prev, supabaseUrl: event.target.value }))}
              placeholder="https://your-project.supabase.co"
              autoComplete="off"
            />
          </label>
          <label>
            Supabase anon public key
            <input
              value={form.supabaseAnonKey}
              onChange={event => setForm(prev => ({ ...prev, supabaseAnonKey: event.target.value }))}
              placeholder="sb_publishable_..."
              autoComplete="off"
            />
          </label>
          <label>
            Cloud account email
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
              placeholder="you@example.com"
              autoComplete="username"
            />
          </label>
          <label>
            Cloud account password
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Not saved in app data"
              autoComplete="current-password"
            />
          </label>
        </div>

        <div className="row-actions cloud-action-row">
          <button type="button" className="secondary-button" onClick={handleSaveSettings} disabled={isBusy}>Save cloud settings</button>
          <button type="button" className="secondary-button" onClick={handleSignUp} disabled={isBusy || !configured}>Sign up</button>
          <button type="button" className="primary-button" onClick={handleSignIn} disabled={isBusy || !configured}>Sign in</button>
          {session.signedIn && session.isExpired && (
            <button type="button" className="secondary-button" onClick={handleRefreshSession} disabled={isBusy || !configured}>Refresh session</button>
          )}
          {session.signedIn && (
            <button type="button" className="secondary-button" onClick={handleClearSession} disabled={isBusy}>Clear saved session</button>
          )}
        </div>

        <div className="storage-health-grid cloud-status-grid login-status-grid">
          <p><span>Configured</span><strong>{configured ? "Yes" : "No"}</strong></p>
          <p><span>Saved session</span><strong>{session.signedIn ? session.user?.email || "Yes" : "No"}</strong></p>
          <p><span>Session expires</span><strong>{session.expiresAt ? new Date(session.expiresAt).toLocaleString("en-GB") : "Never"}</strong></p>
          <p><span>Account check</span><strong>{wrongAccount ? "Wrong account" : "OK"}</strong></p>
        </div>

        {wrongAccount && (
          <div className="backup-warning-box danger-box">
            <strong>Different Supabase account signed in</strong>
            <span>Sign in with the cloud account already linked to this local budget data.</span>
          </div>
        )}

        {status && <p className="cloud-status-message">{status}</p>}

        <div className="row-actions">
          <button type="button" className="secondary-button small" onClick={() => setShowSql(value => !value)}>
            {showSql ? "Hide Supabase SQL setup" : "Show Supabase SQL setup"}
          </button>
        </div>

        {showSql && (
          <div className="cloud-sql-box">
            <p className="muted-text">Run this once in the Supabase SQL Editor. It creates the backup table and security policies.</p>
            <textarea readOnly value={getSupabaseSetupSql()} rows={16} />
          </div>
        )}
      </section>
    </main>
  );
}
