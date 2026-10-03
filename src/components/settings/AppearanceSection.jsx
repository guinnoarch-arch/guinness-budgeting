import { ACCENT_PRESETS, DEFAULT_ACCENT_COLOUR } from "../../utils/theme.js";

function isValidHexColour(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

export default function AppearanceSection({ appData, actions, settings, accordion }) {
  const { sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  function updateAppearanceSetting(field, value) {
    const displayOnlyFields = ["themeMode", "accentColor", "backupWarningsEnabled"];
    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        [field]: value,
        ...(field === "themeMode" ? { darkModeEnabled: value === "dark" } : {})
      }
    }, {
      reason: field === "themeMode" ? "Theme changed" : field === "accentColor" ? "Accent colour changed" : field === "backupWarningsEnabled" ? "Backup warning preference changed" : "Display setting changed",
      markDirty: displayOnlyFields.includes(field) ? false : undefined
    });
  }

  function updateAccentColour(value) {
    if (!isValidHexColour(value)) return;
    updateAppearanceSetting("accentColor", value.toLowerCase());
  }

  return (
    <section className={sectionClass("appearance", "appearance-settings-card")}>
      <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("appearance")}>
        <div>
          <p className="eyebrow">Display</p>
          <h3>Appearance and dashboard layout</h3>
        </div>
        <div className="settings-accordion-heading-side"><span className="pill">V2.6</span><SectionChevron sectionId="appearance" /></div>
      </div>

      <div className="form-grid appearance-form-grid">
        <label>
          Theme
          <select
            value={settings.themeMode || (settings.darkModeEnabled ? "dark" : "light")}
            onChange={event => updateAppearanceSetting("themeMode", event.target.value)}
          >
            <option value="light">Light mode</option>
            <option value="dark">Dark mode</option>
            <option value="system">Use device setting</option>
          </select>
        </label>

        <label>
          Highlight colour
          <select
            value={settings.accentColor || DEFAULT_ACCENT_COLOUR}
            onChange={event => updateAccentColour(event.target.value)}
          >
            {ACCENT_PRESETS.map(preset => (
              <option key={preset.value} value={preset.value}>{preset.name}</option>
            ))}
          </select>
        </label>

        <label>
          Custom highlight colour
          <input
            type="color"
            value={settings.accentColor || DEFAULT_ACCENT_COLOUR}
            onChange={event => updateAccentColour(event.target.value)}
            aria-label="Choose custom highlight colour"
          />
        </label>

        <label>
          Default dashboard layout
          <select
            value={settings.dashboardLayout || "full"}
            onChange={event => updateAppearanceSetting("dashboardLayout", event.target.value)}
          >
            <option value="full">Full dashboard</option>
            <option value="simple">Simple money left</option>
            <option value="compact">Compact dashboard</option>
          </select>
        </label>

        <label className="checkbox-label appearance-checkbox-label">
          <input
            type="checkbox"
            checked={settings.backupButtonFlashEnabled !== false}
            onChange={event => updateAppearanceSetting("backupButtonFlashEnabled", event.target.checked)}
          />
          Allow Backup Now button to slowly flash when backup is urgent
        </label>

        <label className="checkbox-label appearance-checkbox-label">
          <input
            type="checkbox"
            checked={settings.backupWarningsEnabled !== false}
            onChange={event => updateAppearanceSetting("backupWarningsEnabled", event.target.checked)}
          />
          Allow backup warnings (the "changes since last backup" banner and the urgent Backup Now header button)
        </label>

        <div className="appearance-preview-card full-width">
          <span className="pill">Preview</span>
          <strong>{settings.themeMode === "dark" ? "Dark dashboard" : settings.themeMode === "system" ? "Device-controlled theme" : "Light dashboard"}</strong>
          <small>Highlight colour: {ACCENT_PRESETS.find(preset => preset.value === (settings.accentColor || DEFAULT_ACCENT_COLOUR))?.name || "Custom"}</small>
          <div className="accent-preview-row">
            <span className="accent-preview-swatch" style={{ background: settings.accentColor || DEFAULT_ACCENT_COLOUR }} />
            <button className="primary-button small" type="button">Example button</button>
            <span className="connection-pill online">Online</span>
          </div>
          <small>Dashboard layout: {settings.dashboardLayout === "simple" ? "Simple money left" : settings.dashboardLayout === "compact" ? "Compact" : "Full"}</small>
          <small>Backup flash: {settings.backupButtonFlashEnabled === false ? "Off" : "On"}</small>
          <small>Backup warnings: {settings.backupWarningsEnabled === false ? "Off" : "On"}</small>
        </div>
      </div>
    </section>
  );
}
