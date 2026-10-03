import { useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/errors.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { APP_VERSION, DATA_SCHEMA_VERSION, buildRestoreComparisonWarnings, parseBackupObject, prepareRestoredAppData } from "../../services/storageService.js";
import { clearStoredCloudSession, deleteSupabaseCloudBackup, downloadCloudBackupJson, fetchSupabaseCloudBackup, fetchLatestSupabaseCloudBackup, getCloudConfig, getSupabaseKeySafetyIssue, getStoredCloudSessionSummary, getSupabaseSetupSql, listSupabaseCloudBackups, uploadSupabaseCloudBackup } from "../../services/cloudBackupService.js";
import { getDisplayUsernameFromSession, ensureProfileForSignedInUser, normaliseEmail, normaliseUsername, signInWithEmailOrUsername } from "../../services/authService.js";
import { CountGrid, WarningList, createEmergencyRestoreSnapshot, formatDateTime } from "./settingsHelpers.jsx";
import { CloudBackupRows } from "./CloudBackupRows.jsx";

export default function CloudBackupSection({ appData, actions, cloudConfigured, cloudSession, profile, setCloudSession, settings, storageHealth, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  const [cloudForm, setCloudForm] = useState(() => ({
    email: appData.settings?.cloudBackup?.cloudUserEmail || appData.profile?.email || "",
    loginIdentifier: appData.settings?.cloudBackup?.cloudUserEmail || "",
    username: appData.settings?.cloudBackup?.cloudUsername || appData.profile?.username || ""
  }));

  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudStatus, setCloudStatus] = useState("");
  const [cloudBackups, setCloudBackups] = useState([]);
  const [cloudRestorePreview, setCloudRestorePreview] = useState(null);
  const [cloudRestorePhrase, setCloudRestorePhrase] = useState("");
  const [showCloudSql, setShowCloudSql] = useState(false);
  const cloudSettings = settings.cloudBackup || {};
  const cloudSetupSql = getSupabaseSetupSql();

  useEffect(() => {
    setCloudForm(prev => ({
      email: settings.cloudBackup?.cloudUserEmail || profile.email || prev.email || "",
      loginIdentifier: prev.loginIdentifier || settings.cloudBackup?.cloudUserEmail || profile.email || "",
      username: settings.cloudBackup?.cloudUsername || profile.username || prev.username || ""
    }));
  }, [settings.cloudBackup?.cloudUserEmail, settings.cloudBackup?.cloudUsername, profile.email, profile.username]);

  function saveCloudSettings(patch = {}) {
    const nextCloud = {
      provider: "supabase",
      mode: "auto-cloud-backup",
      enabled: Boolean(patch.enabled ?? cloudSettings.enabled ?? false),
      autoBackupEnabled: patch.autoBackupEnabled ?? cloudSettings.autoBackupEnabled ?? true,
      requireLoginBeforeData: patch.requireLoginBeforeData ?? cloudSettings.requireLoginBeforeData ?? true,
      supabaseUrl: "",
      supabaseAnonKey: "",
      tableName: patch.tableName || cloudSettings.tableName || "gh_cloud_backups",
      cloudUserId: patch.cloudUserId ?? cloudSettings.cloudUserId ?? null,
      cloudUsername: patch.cloudUsername ?? normaliseUsername(cloudForm.username || cloudSettings.cloudUsername || ""),
      cloudUserEmail: patch.cloudUserEmail ?? normaliseEmail(cloudForm.email || cloudSettings.cloudUserEmail || ""),
      lastSignedInAt: patch.lastSignedInAt ?? cloudSettings.lastSignedInAt ?? null,
      lastCloudBackupAt: patch.lastCloudBackupAt ?? cloudSettings.lastCloudBackupAt ?? null,
      lastCloudBackupId: patch.lastCloudBackupId ?? cloudSettings.lastCloudBackupId ?? null,
      lastCloudRestoreAt: patch.lastCloudRestoreAt ?? cloudSettings.lastCloudRestoreAt ?? null,
      lastCloudListAt: patch.lastCloudListAt ?? cloudSettings.lastCloudListAt ?? null,
      lastCloudError: patch.lastCloudError ?? null,
      cloudBackupNeeded: patch.cloudBackupNeeded ?? cloudSettings.cloudBackupNeeded ?? false,
      linkedLocalDataAt: patch.linkedLocalDataAt ?? cloudSettings.linkedLocalDataAt ?? null,
      lastAutoCloudBackupAt: patch.lastAutoCloudBackupAt ?? cloudSettings.lastAutoCloudBackupAt ?? null,
      cloudConflict: patch.cloudConflict ?? cloudSettings.cloudConflict ?? null,
      lastCloudConflictAt: patch.lastCloudConflictAt ?? cloudSettings.lastCloudConflictAt ?? null,
      autoSyncOnOpen: patch.autoSyncOnOpen ?? cloudSettings.autoSyncOnOpen ?? true,
      lastCloudSyncAt: patch.lastCloudSyncAt ?? cloudSettings.lastCloudSyncAt ?? null,
      lastCloudSyncMessage: patch.lastCloudSyncMessage ?? cloudSettings.lastCloudSyncMessage ?? null,
      appSessionDays: Number(patch.appSessionDays ?? cloudSettings.appSessionDays ?? 7),
      version: "1"
    };

    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        cloudBackup: nextCloud
      }
    }, { reason: "Cloud backup settings changed", markDirty: false });

    return nextCloud;
  }

  async function cloudSignIn() {
    const keySafetyIssue = getSupabaseKeySafetyIssue(getCloudConfig(settings).anonKey);
    if (keySafetyIssue) {
      setCloudStatus(keySafetyIssue);
      return;
    }

    setCloudStatus("Signing in...");
    try {
      const nextCloud = saveCloudSettings({
        enabled: true,
        cloudUserEmail: normaliseEmail(cloudForm.email),
        cloudUsername: normaliseUsername(cloudForm.username),
        lastCloudError: null
      });
      const session = await signInWithEmailOrUsername({ ...settings, cloudBackup: nextCloud }, cloudForm.loginIdentifier || cloudForm.email, cloudPassword);
      setCloudSession(getStoredCloudSessionSummary({ ...settings, cloudBackup: nextCloud }));
      actions.refreshCloudAuthState?.();
      setCloudPassword("");
      const profileUsername = cloudForm.username || session.user?.user_metadata?.username || profile.username || "";
      await ensureProfileForSignedInUser({ ...settings, cloudBackup: nextCloud }, session, profileUsername).catch(() => null);
      saveCloudSettings({
        ...nextCloud,
        enabled: true,
        cloudUserId: session.user?.id || null,
        cloudUsername: normaliseUsername(profileUsername),
        cloudUserEmail: session.user?.email || normaliseEmail(cloudForm.email),
        lastSignedInAt: new Date().toISOString(),
        cloudBackupNeeded: Boolean(!nextCloud.linkedLocalDataAt),
        lastCloudError: null
      });
      setCloudStatus("Signed in. Cloud backup is on.");
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Sign-in didn't work. Check your details and try again."));
      saveCloudSettings({ lastCloudError: getErrorMessage(error, "Sign-in didn't work. Check your details and try again.") });
    }
  }

  function cloudSignOut() {
    clearStoredCloudSession();
    setCloudSession(getStoredCloudSessionSummary(settings));
    actions.refreshCloudAuthState?.();
    setCloudBackups([]);
    setCloudStatus("Signed out on this device.");
  }

  async function refreshCloudBackupList() {
    setCloudStatus("Loading cloud backups...");
    try {
      const rows = await listSupabaseCloudBackups(settings, 10);
      setCloudBackups(rows);
      saveCloudSettings({ lastCloudListAt: new Date().toISOString(), lastCloudError: null });
      setCloudStatus(rows.length ? `Loaded ${rows.length} cloud backup(s).` : "No cloud backups found yet.");
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Couldn't list cloud backups. Try again in a moment."));
      saveCloudSettings({ lastCloudError: getErrorMessage(error, "Couldn't list cloud backups. Try again in a moment.") });
    }
  }

  async function uploadCloudBackupNow() {
    if (!cloudConfigured) {
      setCloudStatus("Cloud backup isn't available in this version of the app.");
      return;
    }

    const warning = settings.hasUnbackedChanges
      ? "You have unbacked local changes. Uploading now will save the current local state to Supabase. Continue?"
      : "Upload a cloud backup of the current local data?";
    if (!confirm(warning)) return;

    setCloudStatus("Uploading cloud backup...");
    try {
      const row = await uploadSupabaseCloudBackup(settings, appData, { exportedAt: new Date().toISOString(), backupType: "manual" });
      const uploadedAt = row?.created_at || new Date().toISOString();
      saveCloudSettings({
        lastCloudBackupAt: uploadedAt,
        lastCloudBackupId: row?.id || null,
        linkedLocalDataAt: cloudSettings.linkedLocalDataAt || uploadedAt,
        cloudBackupNeeded: false,
        lastCloudError: null
      });
      await refreshCloudBackupList();
      setCloudStatus("Backed up to the cloud.");
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Cloud backup upload failed. Try again in a moment."));
      saveCloudSettings({ lastCloudError: getErrorMessage(error, "Cloud backup upload failed. Try again in a moment.") });
    }
  }

  async function linkLocalDataToCloud() {
    if (!cloudSession.signedIn) {
      setCloudStatus("Sign in first, then link this device's data to your account.");
      return;
    }
    if (!confirm("Link this browser's existing local data to the signed-in account and upload the first cloud backup?")) return;
    setCloudStatus("Linking local data and uploading first cloud backup...");
    try {
      const row = await uploadSupabaseCloudBackup(settings, appData, {
        exportedAt: new Date().toISOString(),
        backupType: "manual",
        label: "Initial linked local data"
      });
      const uploadedAt = row?.created_at || new Date().toISOString();
      saveCloudSettings({
        linkedLocalDataAt: uploadedAt,
        lastCloudBackupAt: uploadedAt,
        lastCloudBackupId: row?.id || null,
        cloudBackupNeeded: false,
        lastCloudError: null
      });
      setCloudStatus("Existing local data is linked to this account and backed up.");
      await refreshCloudBackupList();
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Couldn't link local data to cloud backup. Try again in a moment."));
      saveCloudSettings({ lastCloudError: getErrorMessage(error, "Couldn't link local data to cloud backup. Try again in a moment."), cloudBackupNeeded: true });
    }
  }

  async function previewCloudRestore(backupId) {
    setCloudStatus("Loading cloud backup preview...");
    setCloudRestorePreview(null);
    setCloudRestorePhrase("");
    try {
      const row = await fetchSupabaseCloudBackup(settings, backupId);
      const preview = parseBackupObject(row.backup_json, `cloud-backup-${String(row.id || "").slice(0, 8)}.json`);
      setCloudRestorePreview({ ...preview, row });
      setCloudStatus("Check the counts below before restoring.");
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Couldn't load cloud backup preview. Try again in a moment."));
    }
  }

  async function previewLatestCloudRestore() {
    setCloudStatus("Loading latest cloud backup...");
    try {
      const row = await fetchLatestSupabaseCloudBackup(settings);
      if (!row?.id) {
        setCloudStatus("There's no cloud backup for this account yet. Back up from a device that has your data first.");
        return;
      }
      await previewCloudRestore(row.id);
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Couldn't load latest cloud backup. Try again in a moment."));
    }
  }

  async function downloadCloudBackup(backupId) {
    setCloudStatus("Downloading cloud backup...");
    try {
      const row = await fetchSupabaseCloudBackup(settings, backupId);
      const result = await downloadCloudBackupJson(row);
      setCloudStatus(result.ok ? `Downloaded ${result.filename}.` : "Cloud backup download did not complete.");
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Cloud backup download failed. Try again in a moment."));
    }
  }

  async function deleteCloudBackup(backupId) {
    if (!confirm("Delete this cloud backup from Supabase? This does not delete local app data.")) return;
    setCloudStatus("Deleting cloud backup...");
    try {
      await deleteSupabaseCloudBackup(settings, backupId);
      setCloudBackups(rows => rows.filter(row => row.id !== backupId));
      setCloudStatus("Cloud backup deleted.");
    } catch (error) {
      setCloudStatus(getErrorMessage(error, "Cloud backup delete failed. Try again in a moment."));
    }
  }

  async function confirmCloudRestore() {
    if (!cloudRestorePreview || cloudRestorePhrase !== "CLOUD RESTORE") return;
    const restoredAt = new Date().toISOString();
    const snapshotCreated = await createEmergencyRestoreSnapshot(appData, "pre-cloud-restore");
    if (!snapshotCreated && !confirm("Could not create an emergency browser snapshot before cloud restore. Continue replacing local data anyway?")) {
      setCloudStatus("The restore was stopped because a safety copy of your current data couldn't be made. Nothing has changed. Export a local backup, then try again.");
      return;
    }

    const nextData = prepareRestoredAppData(
      cloudRestorePreview.data,
      cloudRestorePreview.filename,
      restoredAt,
      cloudRestorePreview.meta
    );

    actions.updateAppData({
      ...nextData,
      settings: {
        ...(nextData.settings || {}),
        cloudBackup: {
          ...cloudSettings,
          lastCloudRestoreAt: restoredAt,
          lastCloudError: null
        }
      }
    }, { markDirty: false });
    setCloudRestorePreview(null);
    setCloudRestorePhrase("");
    setCloudStatus("Cloud backup restored on this device. Check your data, then export a local backup as a safe copy.");
    actions.notify("Cloud backup restored.");
  }

  return (
    <section className={sectionClass("cloud", "cloud-backup-card")}>
      <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("cloud")}>
        <div>
          <h3>Cloud backup</h3>
        </div>
        <div className="settings-accordion-heading-side">
          <span className={cloudSession.signedIn ? "pill storage-ok" : cloudConfigured ? "pill storage-warning" : "pill storage-bad"}>
            {cloudSession.signedIn ? "Signed in" : cloudConfigured ? "Backup available" : "Not available"}
          </span>
          <SectionChevron sectionId="cloud" />
        </div>
      </div>

      {activeSettingsSection === "cloud" && (
        <div className="cloud-backup-panel">
          <div className="backup-warning-box cloud-warning-box">
            <strong>Auth cloud backup mode, not automatic live sync.</strong>
            <ul>
              <li>Data still saves locally in IndexedDB first.</li>
              <li>Cloud backup is an extra safety copy after sign-in.</li>
              <li>On a phone or new device, open the app, sign in, preview the latest backup, then restore it only if it is the data you expect.</li>
              <li>Receipt/image cloud backup is intentionally disabled for now to protect the free quota.</li>
              <li>Do not restore from cloud unless you have checked the preview counts.</li>
            </ul>
          </div>

          {!cloudSettings.linkedLocalDataAt && cloudSession.signedIn && (
            <div className="backup-warning-box cloud-warning-box">
              <strong>Existing local data is not linked yet</strong>
              <span>To protect existing users, the app will not upload this browser's saved budget to the signed-in account until you confirm.</span>
              <div className="row-actions">
                <AsyncButton busyLabel="Uploading…" type="button" className="primary-button small" onClick={linkLocalDataToCloud}>Link local data and upload first backup</AsyncButton>
              </div>
            </div>
          )}

          {cloudSettings.cloudConflict && (
            <div className="backup-warning-box danger-box">
              <strong>Newer cloud backup detected</strong>
              <span>{cloudSettings.cloudConflict.message || "Review the latest cloud backup before replacing local or cloud data."}</span>
              <div className="row-actions">
                <button type="button" className="secondary-button small" onClick={actions.backupNow}>Download local backup first</button>
                <button type="button" className="secondary-button small" onClick={() => saveCloudSettings({ cloudConflict: null })}>Keep local data</button>
                <AsyncButton busyLabel="Loading…" type="button" className="primary-button small" onClick={previewLatestCloudRestore}>Restore cloud backup</AsyncButton>
              </div>
            </div>
          )}

          {!cloudConfigured && (
            <div className="backup-warning-box danger-box">
              <strong>Cloud backup is not available for this build.</strong>
              <span>Ask the app owner to enable cloud backup for this deployment.</span>
            </div>
          )}

          <div className="backup-status-grid">
            <div className="backup-status-item">
              <span>Account</span>
              <strong>{cloudSession.signedIn ? getDisplayUsernameFromSession(cloudSession) : "Signed out"}</strong>
              <small>{cloudSession.signedIn ? "Supabase Auth is active on this browser." : "Sign in before using cloud backup."}</small>
              {cloudSession.signedIn ? (
                <button type="button" className="secondary-button small" onClick={cloudSignOut}>Sign out</button>
              ) : null}
            </div>

            <div className="backup-status-item">
              <span>Cloud backup</span>
              <strong>{!cloudConfigured ? "Not available" : cloudSettings.lastCloudError ? "Failed" : cloudSettings.cloudBackupNeeded ? "Backup needed" : cloudSettings.lastCloudBackupAt ? "Up to date" : "Not backed up yet"}</strong>
              <small>Last backup: {formatDateTime(cloudSettings.lastCloudBackupAt)}</small>
            </div>

            <div className="backup-status-item">
              <span>Local backup</span>
              <strong>{settings.lastBackupAt ? "Available" : "Recommended"}</strong>
              <small>Last local backup: {formatDateTime(settings.lastBackupAt)}</small>
            </div>
          </div>

          {!cloudSession.signedIn ? (
            <div className="restore-preview-box">
              <div className="section-header compact-header">
                <div>
                  <h4>Sign in</h4>
                </div>
              </div>
              <div className="cloud-setup-grid">
                <label>
                  Email or username
                  <input
                    value={cloudForm.loginIdentifier}
                    onChange={event => setCloudForm(prev => ({ ...prev, loginIdentifier: event.target.value }))}
                    placeholder="you@example.com or yourusername"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={cloudPassword}
                    onChange={event => setCloudPassword(event.target.value)}
                    placeholder="Not saved in app data"
                  />
                </label>
              </div>
              <div className="row-actions cloud-action-row">
                <AsyncButton busyLabel="Signing in…" type="button" className="primary-button" onClick={cloudSignIn} disabled={!cloudConfigured}>Sign in</AsyncButton>
                <button type="button" className="secondary-button" onClick={() => setCloudStatus("Use the login screen to create a new account if you are signed out.")}>Create account</button>
              </div>
            </div>
          ) : null}

          {cloudStatus && <p className="cloud-status-message">{cloudStatus}</p>}

          <div className="restore-preview-box">
            <div className="section-header compact-header">
              <div>
                <h4>Cloud backup</h4>
              </div>
            </div>
            <div className="storage-health-grid cloud-status-grid">
              <p><span>Enabled</span><strong>{cloudSettings.enabled ? "Yes" : "No"}</strong></p>
              <p><span>Automatic backups</span><strong>{cloudSettings.autoBackupEnabled === false ? "Off" : "On"}</strong></p>
              <p><span>Last auto backup</span><strong>{formatDateTime(cloudSettings.lastAutoCloudBackupAt)}</strong></p>
              <p><span>Local changes waiting</span><strong>{cloudSettings.cloudBackupNeeded ? "Yes" : "No"}</strong></p>
              <p><span>Last restore</span><strong>{formatDateTime(cloudSettings.lastCloudRestoreAt)}</strong></p>
              <p><span>Last error</span><strong>{cloudSettings.lastCloudError || "None"}</strong></p>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={cloudSettings.autoBackupEnabled !== false}
                onChange={event => saveCloudSettings({ autoBackupEnabled: event.target.checked })}
                disabled={!cloudSession.signedIn || !cloudConfigured}
              />
              Automatically back up to the cloud a little after each change, once signed in
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={cloudSettings.autoSyncOnOpen !== false}
                onChange={event => saveCloudSettings({ autoSyncOnOpen: event.target.checked })}
                disabled={!cloudSession.signedIn || !cloudConfigured}
              />
              Keep my devices in sync: each time the app opens (or you come back to it), open whichever version was changed most recently — this device's or the cloud's
            </label>
            {cloudSettings.lastCloudSyncAt && (
              <p className="muted-text">Last sync check {formatDateTime(cloudSettings.lastCloudSyncAt)}: {cloudSettings.lastCloudSyncMessage || "up to date"}.</p>
            )}
            <div className="cloud-sync-actions">
              <AsyncButton busyLabel="Uploading…" type="button" className="primary-button" onClick={uploadCloudBackupNow} disabled={!cloudSession.signedIn || !cloudConfigured}>
                Back up now
              </AsyncButton>
              <AsyncButton busyLabel="Loading…" type="button" className="secondary-button" onClick={previewLatestCloudRestore} disabled={!cloudSession.signedIn || !cloudConfigured}>
                Restore latest cloud backup
              </AsyncButton>
              <AsyncButton busyLabel="Refreshing…" type="button" className="secondary-button" onClick={refreshCloudBackupList} disabled={!cloudSession.signedIn || !cloudConfigured}>
                Refresh cloud backup list
              </AsyncButton>
            </div>
            {(!cloudSession.signedIn || !cloudConfigured) && (
              <p className="muted-text">
                {cloudConfigured
                  ? "Sign in above to back up to the cloud or restore a cloud backup."
                  : "Cloud backup isn't set up in this version of the app, so only local backups are available."}
              </p>
            )}
          </div>

          <div className="restore-preview-box">
            <div className="section-header compact-header">
              <div>
                <h4>Local backup</h4>
              </div>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary-button" onClick={actions.backupNow}>Download local JSON backup</button>
            </div>
          </div>

          <details className="restore-preview-box">
            <summary><strong>Advanced / developer info</strong></summary>
            <div className="storage-health-grid cloud-status-grid">
              <p><span>App version</span><strong>V{APP_VERSION}</strong></p>
              <p><span>Data version</span><strong>{settings.dataVersion || DATA_SCHEMA_VERSION}</strong></p>
              <p><span>Cloud table</span><strong>{cloudSettings.tableName || "gh_cloud_backups"}</strong></p>
              <p><span>Cloud records listed</span><strong>{cloudBackups.length}</strong></p>
              <p><span>Storage status</span><strong>{storageHealth.status}</strong></p>
              <p><span>Last migration</span><strong>{formatDateTime(storageHealth.lastMigrationRunAt)}</strong></p>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary-button small" onClick={() => setShowCloudSql(value => !value)}>
                {showCloudSql ? "Hide Supabase SQL" : "Show Supabase SQL setup"}
              </button>
            </div>
            {showCloudSql && (
              <div className="cloud-sql-box">
                <p className="muted-text">Run this in Supabase SQL Editor. It creates the backup table, profile table, resolver RPC and Row Level Security policies.</p>
                <textarea readOnly value={cloudSetupSql} rows={18} />
              </div>
            )}
          </details>

          <div className="section-header compact-header">
            <div>
              <h4>Cloud backups</h4>
            </div>
            <span className="pill">{cloudBackups.length}</span>
          </div>

          <CloudBackupRows
            rows={cloudBackups}
            onPreview={previewCloudRestore}
            onDownload={downloadCloudBackup}
            onDelete={deleteCloudBackup}
          />

          {cloudRestorePreview && (
            <div className="restore-preview-box cloud-restore-preview-box">
              <div className="section-header">
                <div>
                  <h4>Cloud restore preview</h4>
                  <p className="muted-text">This will replace the current local IndexedDB data. Check counts first.</p>
                </div>
                <button className="icon-button" onClick={() => { setCloudRestorePreview(null); setCloudRestorePhrase(""); }}>×</button>
              </div>

              <div className="backup-meta-grid">
                <p><span>Cloud backup</span><strong>{cloudRestorePreview.row?.backup_label || cloudRestorePreview.filename}</strong></p>
                <p><span>Created</span><strong>{formatDateTime(cloudRestorePreview.row?.client_generated_at || cloudRestorePreview.row?.created_at)}</strong></p>
                <p><span>Backup format</span><strong>{cloudRestorePreview.meta.backupFormatVersion}</strong></p>
                <p><span>App version</span><strong>{cloudRestorePreview.meta.appVersion}</strong></p>
              </div>

              <WarningList warnings={[...cloudRestorePreview.warnings, ...buildRestoreComparisonWarnings(appData, cloudRestorePreview)]} />
              <CountGrid counts={cloudRestorePreview.counts} />

              <label className="restore-confirm-label">
                Type CLOUD RESTORE to replace current local data
                <input
                  value={cloudRestorePhrase}
                  onChange={event => setCloudRestorePhrase(event.target.value)}
                  placeholder="CLOUD RESTORE"
                />
              </label>

              <div className="modal-actions">
                <button className="secondary-button" onClick={() => { setCloudRestorePreview(null); setCloudRestorePhrase(""); }}>Cancel</button>
                <AsyncButton busyLabel="Restoring…"
                  className="danger-button"
                  onClick={confirmCloudRestore}
                  disabled={cloudRestorePhrase !== "CLOUD RESTORE"}
                >
                  Replace local data with this cloud backup
                </AsyncButton>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
