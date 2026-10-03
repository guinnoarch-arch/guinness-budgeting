import { APP_VERSION, DATA_SCHEMA_VERSION } from "../../services/storageService.js";

const CHANGELOG_ITEMS = [
  "V2.6.27 restores the full mortgage tracker inside House, including mortgage projections, linked payment history and richer mortgage fields.",
  "V2.6.26 adds app health, dashboard breakdowns, activity log, backup risk, month close assistant, budget templates and suggestion voting foundations.",
  "V2.6.25 cleaned setup defaults, example data removal, header actions and admin suggestions.",
  "V2.6.24 added Supabase-backed house sharing."
];

export default function AboutSection({ actions, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  return (
    <section className={sectionClass("about", "settings-section-entry-card")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("about")}>
        <div>
          <h3>About / changelog</h3>
        </div>
        <div className="settings-accordion-heading-side"><span className="pill">V{APP_VERSION}</span><SectionChevron sectionId="about" /></div>
      </div>
      {activeSettingsSection === "about" && (
        <div className="suggestion-list">
          <div className="profile-meta-grid">
            <p><span>App version</span><strong>V{APP_VERSION}</strong></p>
            <p><span>Data version</span><strong>{DATA_SCHEMA_VERSION}</strong></p>
            <p><span>Update ready</span><strong>{actions.pwaInstall?.hasUpdateAvailable ? "Yes" : "No"}</strong></p>
            <p><span>Service worker</span><strong>{actions.pwaInstall?.serviceWorkerReady ? "Ready" : "Not ready yet"}</strong></p>
          </div>
          {CHANGELOG_ITEMS.map(item => <div className="suggestion-row" key={item}><strong>{item}</strong></div>)}
        </div>
      )}
    </section>
  );
}
