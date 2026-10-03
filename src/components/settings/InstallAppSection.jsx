import PwaInstallCard from "./PwaInstallCard.jsx";

export default function InstallAppSection({ actions, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  return (
    <section className={sectionClass("install", "pwa-install-card settings-install-entry")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("install")}>
        <div>
          <h3>Install app and offline mode</h3>
        </div>
        <div className="settings-accordion-heading-side"><img className="settings-app-icon compact" src="/icons/gb-icon-192.png" alt="" /><SectionChevron sectionId="install" /></div>
      </div>

      {activeSettingsSection === "install" && <PwaInstallCard pwaInstall={actions.pwaInstall} actions={actions} embedded />}
    </section>
  );
}
