import AsyncButton from "../common/AsyncButton.jsx";
import { formatDateTime } from "./settingsHelpers.jsx";

function riskLabelFromBackup(reminder, settings = {}) {
  const changes = Number(settings.changesSinceBackup || 0);
  if (reminder.level === "danger" || changes >= 25) return "Critical";
  if (changes >= 10 || settings.lastMajorChangeAt) return "High risk";
  if (reminder.level === "warning" || reminder.level === "notice" || changes > 0) return "Recommended";
  return "Safe";
}

export default function BackupRiskSection({ actions, backupReminder, settings, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const backupRisk = riskLabelFromBackup(backupReminder, settings);

  return (
    <section className={sectionClass("backupRisk", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("backupRisk")}>
        <div>
          <h3>Backup risk</h3>
        </div>
        <div className="settings-accordion-heading-side"><span className="pill">{backupRisk}</span><SectionChevron sectionId="backupRisk" /></div>
      </div>
      {activeSettingsSection === "backupRisk" && (
        <div className="profile-meta-grid">
          <p><span>Status</span><strong>{backupRisk}</strong><small>{backupReminder.message}</small></p>
          <p><span>Unbacked changes</span><strong>{settings.hasUnbackedChanges ? "Yes" : "No"}</strong><small>{settings.changesSinceBackup || 0} change(s)</small></p>
          <p><span>Last backup</span><strong>{settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : "Never"}</strong></p>
          <p><span>Last major change</span><strong>{settings.lastMajorChangeAt ? formatDateTime(settings.lastMajorChangeAt) : "None recorded"}</strong></p>
          <AsyncButton busyLabel="Saving backup…" type="button" className="primary-button" onClick={actions.backupNow}>Export JSON backup</AsyncButton>
        </div>
      )}
    </section>
  );
}
