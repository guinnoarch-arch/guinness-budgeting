import { formatDateTime } from "./settingsHelpers.jsx";

export default function ActivityLogSection({ appData, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  return (
    <section className={sectionClass("activity", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("activity")}>
        <div>
          <h3>Activity log</h3>
        </div>
        <SectionChevron sectionId="activity" />
      </div>
      {activeSettingsSection === "activity" && (
        <div className="suggestion-list">
          {(appData.activityLog || []).slice(0, 30).length === 0 ? <p className="muted-text">No activity recorded yet.</p> : (appData.activityLog || []).slice(0, 30).map(item => (
            <div className="suggestion-row" key={item.id}>
              <div>
                <strong>{item.description}</strong>
                <small>{item.area || "App"} - {item.user || "Local user"} - {formatDateTime(item.createdAt)}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
