import { useState } from "react";
import { getErrorMessage } from "../../utils/errors.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { updateLocalProfile } from "../../services/storageService.js";
import { ADMIN_ROLE_FIELD, ADMIN_ROUTE_PATH, claimAdminRole } from "../../services/adminService.js";
import { formatDateTime } from "./settingsHelpers.jsx";

export default function ProfileSection({ appData, actions, cloudSession, profile, settings, accordion }) {
  const { sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [adminProfileStatus, setAdminProfileStatus] = useState("");
  const adminStatus = actions.adminStatus || {};

  async function becomeAdmin() {
    if (!cloudSession?.signedIn) {
      setAdminProfileStatus("Sign in first, then try again.");
      return;
    }

    if (!adminStatus.canClaimAdmin) {
      setAdminProfileStatus("Admin access can't be claimed right now. An existing admin needs to turn on admin claim mode in Control Centre.");
      return;
    }

    setAdminProfileStatus("Claiming admin access...");
    try {
      await claimAdminRole(settings);
      await actions.refreshAdminAccess?.();
      setAdminProfileStatus("This account is now admin. Admin claim mode has been turned off.");
    } catch (error) {
      setAdminProfileStatus(getErrorMessage(error, "Couldn't claim admin access. Try again in a moment."));
    }
  }

  function updateProfileField(field, value) {
    const updatedAt = new Date().toISOString();
    const nextProfile = {
      ...profile,
      [field]: value,
      updatedAt
    };

    const nextSettings = {
      ...settings
    };

    if (field === "currency") {
      nextSettings.currency = value;
    }
    if (field === "currencySymbol") {
      nextSettings.currencySymbol = value;
    }
    if (field === "monthMode") {
      nextSettings.monthMode = value;
    }
    if (field === "customMonthStartDay") {
      nextSettings.customMonthStartDay = Number(value);
    }

    const profiledData = updateLocalProfile({
      ...appData,
      settings: nextSettings
    }, nextProfile);

    actions.updateAppData(profiledData);
  }

  return (
    <section className={sectionClass("profile", "profile-settings-card")}>
      <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("profile")}>
        <div>
          <h3>Profile</h3>
        </div>
        <div className="settings-accordion-heading-side"><span className="pill">Local profile</span><SectionChevron sectionId="profile" /></div>
      </div>

      <div className="form-grid profile-form-grid">
        <label>
          Username
          <input
            value={profile.username || profile.displayName || ""}
            onChange={event => updateProfileField("username", event.target.value)}
            placeholder="e.g. Archie"
          />
        </label>

        <label>
          Display name
          <input
            value={profile.displayName || ""}
            onChange={event => updateProfileField("displayName", event.target.value)}
            placeholder="e.g. Archie"
          />
        </label>

        <label>
          Email address optional
          <input
            type="email"
            value={profile.email || ""}
            onChange={event => updateProfileField("email", event.target.value)}
            placeholder="Used later for cloud login"
          />
        </label>

        <label>
          Budget/profile name
          <input
            value={profile.profileName || ""}
            onChange={event => updateProfileField("profileName", event.target.value)}
            placeholder="e.g. Personal Budget"
          />
        </label>

        <label>
          Profile type
          <select
            value={profile.profileType || "Personal"}
            onChange={event => updateProfileField("profileType", event.target.value)}
          >
            <option value="Personal">Personal</option>
            <option value="Student">Student</option>
            <option value="Household">Household</option>
            <option value="Shared house">Shared house</option>
            <option value="Family">Family</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label>
          Currency
          <select
            value={profile.currency || settings.currency || "GBP"}
            onChange={event => updateProfileField("currency", event.target.value)}
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </label>

        <label>
          Currency symbol
          <input
            value={profile.currencySymbol || settings.currencySymbol || "£"}
            onChange={event => updateProfileField("currencySymbol", event.target.value)}
            placeholder="£"
          />
        </label>

        <label>
          Month mode
          <select
            value={profile.monthMode || settings.monthMode || "calendar"}
            onChange={event => updateProfileField("monthMode", event.target.value)}
          >
            <option value="calendar">Calendar month</option>
            <option value="custom">Custom/payday month</option>
          </select>
        </label>

        <label>
          Custom month start day
          <input
            type="number"
            min="1"
            max="28"
            value={profile.customMonthStartDay || settings.customMonthStartDay || 1}
            onChange={event => updateProfileField("customMonthStartDay", event.target.value)}
          />
        </label>

        <label className="full-width">
          Notes/details
          <textarea
            value={profile.notes || ""}
            onChange={event => updateProfileField("notes", event.target.value)}
            placeholder="Optional notes, e.g. personal budget, uni house bills, family account, etc."
          />
        </label>
      </div>

      <div className="profile-meta-grid">
        <p><span>Local profile ID</span><strong>{profile.localProfileId || "Not created yet"}</strong></p>
        <p><span>Active profile ID</span><strong>{appData.activeProfileId || profile.localProfileId || "Not set"}</strong></p>
        <p><span>Profiles stored</span><strong>{(appData.profiles || []).length || 1}</strong></p>
        <p><span>Cloud user ID</span><strong>{profile.cloudUserId || "Not connected"}</strong></p>
        <p><span>Login type</span><strong>{profile.localOnly === false ? "Cloud-ready profile" : "Local username only"}</strong></p>
        <p><span>Profile updated</span><strong>{formatDateTime(profile.updatedAt)}</strong></p>
      </div>

      <div className="admin-profile-entry">
        <div>
          <p className="eyebrow">Admin access</p>
          <h4>Admin Control Centre</h4>
          <p className="muted-text">
            Admin status is checked from Supabase using <strong>{ADMIN_ROLE_FIELD} = 'admin'</strong>. No service-role key is used in the browser.
          </p>
          <div className="profile-meta-grid compact-admin-meta">
            <p><span>Signed in</span><strong>{cloudSession?.signedIn ? "Yes" : "No"}</strong></p>
            <p><span>Current role</span><strong>{adminStatus.role || "user"}</strong></p>
            <p><span>Admin exists</span><strong>{adminStatus.adminExists ? "Yes" : "No"}</strong></p>
            <p><span>Admin claim mode</span><strong>{adminStatus.adminClaimEnabled ? "ON" : "OFF"}</strong></p>
          </div>
        </div>

        <div className="row-actions admin-profile-actions">
          {adminStatus.isAdmin && (
            <button type="button" className="primary-button" onClick={() => actions.setActivePage?.("control")}>
              Open Admin Control Centre
            </button>
          )}
          {!adminStatus.isAdmin && adminStatus.canClaimAdmin && (
            <AsyncButton busyLabel="Checking…" type="button" className="secondary-button" onClick={becomeAdmin}>
              Become admin
            </AsyncButton>
          )}
          {!adminStatus.isAdmin && !adminStatus.canClaimAdmin && (
            <span className="pill">Not admin</span>
          )}
        </div>

        {adminStatus.error && (
          <div className="cloud-status-message compact-status warning-status">
            {adminStatus.error} Run the updated Supabase SQL setup if admin controls are not available yet.
          </div>
        )}
        {adminProfileStatus && <p className="cloud-status-message compact-status">{adminProfileStatus}</p>}
        <small className="muted-text">Direct route: {ADMIN_ROUTE_PATH}. Non-admin users are blocked by the Supabase-backed route guard.</small>
      </div>

      <div className="profile-session-actions">
        <button type="button" className="secondary-button" onClick={actions.logoutApp}>
          Logout
        </button>
        <small className="muted-text">Backs up if needed, then signs out of this browser session.</small>
      </div>
    </section>
  );
}
