import { APP_VERSION } from "../../services/storageService.js";
import { formatDateTime } from "./settingsHelpers.jsx";

export default function HealthCheckSection({ actions, backupReminder, cloudConfigured, cloudSession, settings, storageHealth, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  const healthRows = [
    ["User logged in", cloudSession?.signedIn ? "OK" : "Warning", cloudSession?.signedIn ? "Yes" : "No"],
    ["Supabase connected", cloudConfigured ? "OK" : "Not available", cloudConfigured ? "Configured" : "Not configured"],
    ["Cloud backups available", cloudConfigured && cloudSession?.signedIn ? "OK" : "Warning", cloudConfigured && cloudSession?.signedIn ? "Available" : "Sign in/configure Supabase"],
    ["Local backup recommended", backupReminder.level === "ok" ? "OK" : "Needs action", backupReminder.title],
    ["Example data active", settings.useExampleData ? "Warning" : "OK", settings.useExampleData ? "Yes" : "No"],
    ["Unbacked changes", settings.hasUnbackedChanges ? "Needs action" : "OK", settings.hasUnbackedChanges ? `${settings.changesSinceBackup || 0} change(s)` : "No"],
    ["PWA installed", actions.pwaInstall?.isInstalled ? "OK" : "Not available", actions.pwaInstall?.isInstalled ? "Yes" : "No"],
    ["App version", "OK", `V${APP_VERSION}`],
    ["Last backup", settings.lastBackupAt ? "OK" : "Warning", settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : "Never recorded"],
    ["Storage health", storageHealth.status === "OK" ? "OK" : "Warning", storageHealth.status]
  ];

  return (
    <section className={sectionClass("health", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("health")}>
        <div>
          <h3>App health check</h3>
        </div>
        <SectionChevron sectionId="health" />
      </div>
      {activeSettingsSection === "health" && (
        <div className="profile-meta-grid">
          {healthRows.map(([label, status, detail]) => (
            <p key={label}><span>{label}</span><strong>{status}</strong><small>{detail}</small></p>
          ))}
        </div>
      )}
    </section>
  );
}
