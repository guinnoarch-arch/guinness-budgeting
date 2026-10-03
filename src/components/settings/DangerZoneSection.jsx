import AsyncButton from "../common/AsyncButton.jsx";
import { clearAppData } from "../../services/storageService.js";
import { getInitialAppData } from "../../data/exampleData.js";
import { formatDateTime } from "./settingsHelpers.jsx";

export default function DangerZoneSection({ actions, settings, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  async function resetAll() {
    const backupWarning = settings.lastBackupAt
      ? `Last backup: ${formatDateTime(settings.lastBackupAt)}. Continue only if this backup is recent enough.`
      : "No backup has been recorded. Export a backup before resetting unless you are sure.";

    if (!confirm(`${backupWarning}\n\nContinue to reset/delete all data?`)) return;

    const phrase = prompt("Type DELETE to reset all app data.");
    if (phrase !== "DELETE") return;
    await clearAppData();
    actions.updateAppData(getInitialAppData());
    window.location.reload();
  }

  return (
    <section className={sectionClass("danger", "danger-zone settings-accordion-danger")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("danger")}>
        <div>
          <h3>Danger zone</h3>
          <p className="muted-text">Reset/delete all data. Export a backup first if you want a recovery copy.</p>
        </div>
        <SectionChevron sectionId="danger" />
      </div>
      {activeSettingsSection === "danger" && <AsyncButton busyLabel="Resetting…" className="danger-button" onClick={resetAll}>Reset all data</AsyncButton>}
    </section>
  );
}
