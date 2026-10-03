import { useEffect, useState } from "react";
import { getErrorMessage } from "../utils/errors.js";
import { getBackupReminder, getStorageHealth, getStorageHealthAsync, checkPersistentBrowserStorage } from "../services/storageService.js";
import { getMonthKey } from "../utils/dates.js";
import { getReceiptStorageStats } from "../services/receiptStorageService.js";
import { listStorageLogs } from "../services/indexedDbStorageService.js";
import { getStoredCloudSessionSummary, isCloudBackupConfigured } from "../services/cloudBackupService.js";
import HealthCheckSection from "../components/settings/HealthCheckSection.jsx";
import BackupRiskSection from "../components/settings/BackupRiskSection.jsx";
import ProfileSection from "../components/settings/ProfileSection.jsx";
import AppearanceSection from "../components/settings/AppearanceSection.jsx";
import BudgetBehaviourSection from "../components/settings/BudgetBehaviourSection.jsx";
import ImportRulesSection from "../components/settings/ImportRulesSection.jsx";
import PaymentRulesSection from "../components/settings/PaymentRulesSection.jsx";
import StorageHealthSection from "../components/settings/StorageHealthSection.jsx";
import CloudBackupSection from "../components/settings/CloudBackupSection.jsx";
import DataValidationSection from "../components/settings/DataValidationSection.jsx";
import BackupRestoreSection from "../components/settings/BackupRestoreSection.jsx";
import ActivityLogSection from "../components/settings/ActivityLogSection.jsx";
import MonthCloseSection from "../components/settings/MonthCloseSection.jsx";
import BudgetTemplatesSection from "../components/settings/BudgetTemplatesSection.jsx";
import PlannedTransactionsSection from "../components/settings/PlannedTransactionsSection.jsx";
import AboutSection from "../components/settings/AboutSection.jsx";
import InstallAppSection from "../components/settings/InstallAppSection.jsx";
import ExampleDataSection from "../components/settings/ExampleDataSection.jsx";
import DangerZoneSection from "../components/settings/DangerZoneSection.jsx";
import SuggestionsSection from "../components/settings/SuggestionsSection.jsx";

export default function SettingsPage({ appData, actions }) {
  const [ruleStatus, setRuleStatus] = useState("");
  const [activeSettingsSection, setActiveSettingsSection] = useState(null);
  const [receiptStats, setReceiptStats] = useState({ available: true, count: 0, totalKilobytes: 0, totalMegabytes: 0, lastUploadedAt: null });
  const [storageHealth, setStorageHealth] = useState(() => getStorageHealth(appData));
  const [persistentStorageStatus, setPersistentStorageStatus] = useState("");
  const [storageLogs, setStorageLogs] = useState([]);
  const [storageLogStatus, setStorageLogStatus] = useState("");
  const [cloudSession, setCloudSession] = useState(() => getStoredCloudSessionSummary());
  const settings = appData.settings || {};
  const profile = appData.profile || {};
  const cloudConfigured = isCloudBackupConfigured(settings);
  const backupReminder = getBackupReminder(settings);
  const selectedMonth = actions.selectedMonth || getMonthKey(new Date());

  useEffect(() => {
    let cancelled = false;

    async function refreshReceiptStats() {
      const stats = await getReceiptStorageStats();
      if (!cancelled) setReceiptStats(stats);
    }

    refreshReceiptStats();

    return () => {
      cancelled = true;
    };
  }, [appData.transactions]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStorageHealth() {
      const [health, persistent] = await Promise.all([
        getStorageHealthAsync(appData),
        checkPersistentBrowserStorage()
      ]);
      if (!cancelled) {
        setStorageHealth(health);
        if (persistent.supported) {
          setPersistentStorageStatus(persistent.persisted ? "Persistent browser storage granted" : "Persistent browser storage not granted yet");
        }
      }
    }

    setStorageHealth(getStorageHealth(appData));
    refreshStorageHealth();

    return () => {
      cancelled = true;
    };
  }, [appData]);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      try {
        const logs = await listStorageLogs({ limit: 30 });
        if (!cancelled) setStorageLogs(logs);
      } catch (error) {
        if (!cancelled) setStorageLogStatus(getErrorMessage(error, "Couldn't load storage logs. Try again in a moment."));
      }
    }

    loadLogs();

    return () => {
      cancelled = true;
    };
  }, [appData?.settings?.migratedFromLocalStorageAt, appData?.settings?.lastValidationRepairAt]);

  useEffect(() => {
    setCloudSession(getStoredCloudSessionSummary(settings));
  }, [settings.cloudBackup?.cloudUserEmail, settings.cloudBackup?.cloudUsername, profile.email, profile.username]);

  useEffect(() => {
    if (!actions.preferredSettingsSection) return;
    setActiveSettingsSection(actions.preferredSettingsSection);
    // Wait for the section to open before scrolling to it.
    window.requestAnimationFrame(() => {
      document.getElementById(`settings-section-${actions.preferredSettingsSection}`)?.scrollIntoView({ block: "start" });
    });
  }, [actions.preferredSettingsSection, actions.settingsSectionRequestId]);

  async function refreshStorageLogList() {
    setStorageLogStatus("");
    try {
      const logs = await listStorageLogs({ limit: 30 });
      setStorageLogs(logs);
    } catch (error) {
      setStorageLogStatus(getErrorMessage(error, "Couldn't load storage logs. Try again in a moment."));
    }
  }

  function updateArrayItem(field, id, patch) {
    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      [field]: (appData[field] || []).map(item => (
        item.id === id ? { ...item, ...patch, updatedAt: now } : item
      ))
    });
    setRuleStatus("Rule saved.");
  }

  function removeArrayItem(field, id, label) {
    if (!confirm(`Delete this ${label}?`)) return;
    actions.updateAppData({
      ...appData,
      [field]: (appData[field] || []).filter(item => item.id !== id)
    });
    setRuleStatus(`Deleted ${label}.`);
  }

  function toggleSettingsSection(sectionId) {
    setActiveSettingsSection(current => current === sectionId ? null : sectionId);
  }

  function sectionClass(sectionId, extraClass = "") {
    return `card settings-accordion-card ${extraClass} ${activeSettingsSection === sectionId ? "is-open" : ""}`;
  }

  function sectionHeaderProps(sectionId) {
    return {
      id: `settings-section-${sectionId}`,
      role: "button",
      tabIndex: 0,
      "aria-expanded": activeSettingsSection === sectionId,
      onClick: () => toggleSettingsSection(sectionId),
      onKeyDown: event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSettingsSection(sectionId);
        }
      }
    };
  }

  function SectionChevron({ sectionId }) {
    return <span className="settings-accordion-chevron" aria-hidden="true">{activeSettingsSection === sectionId ? "−" : "+"}</span>;
  }

  const accordion = { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron };

  return (
    <div className="page-grid">
      <div className="settings-page-intro">
        <h2>App settings</h2>
      </div>

      <HealthCheckSection actions={actions} backupReminder={backupReminder} cloudConfigured={cloudConfigured} cloudSession={cloudSession} settings={settings} storageHealth={storageHealth} accordion={accordion} />
      <BackupRiskSection actions={actions} backupReminder={backupReminder} settings={settings} accordion={accordion} />
      <ProfileSection appData={appData} actions={actions} cloudSession={cloudSession} profile={profile} settings={settings} accordion={accordion} />
      <AppearanceSection appData={appData} actions={actions} settings={settings} accordion={accordion} />
      <BudgetBehaviourSection appData={appData} actions={actions} settings={settings} accordion={accordion} />
      <ImportRulesSection appData={appData} actions={actions} removeArrayItem={removeArrayItem} ruleStatus={ruleStatus} setRuleStatus={setRuleStatus} updateArrayItem={updateArrayItem} accordion={accordion} />
      <PaymentRulesSection appData={appData} actions={actions} removeArrayItem={removeArrayItem} ruleStatus={ruleStatus} setRuleStatus={setRuleStatus} settings={settings} updateArrayItem={updateArrayItem} accordion={accordion} />
      <StorageHealthSection appData={appData} actions={actions} backupReminder={backupReminder} persistentStorageStatus={persistentStorageStatus} receiptStats={receiptStats} refreshStorageLogList={refreshStorageLogList} setPersistentStorageStatus={setPersistentStorageStatus} setStorageLogStatus={setStorageLogStatus} setStorageLogs={setStorageLogs} settings={settings} storageHealth={storageHealth} storageLogStatus={storageLogStatus} storageLogs={storageLogs} accordion={accordion} />
      <CloudBackupSection appData={appData} actions={actions} cloudConfigured={cloudConfigured} cloudSession={cloudSession} profile={profile} setCloudSession={setCloudSession} settings={settings} storageHealth={storageHealth} accordion={accordion} />
      <DataValidationSection appData={appData} actions={actions} refreshStorageLogList={refreshStorageLogList} settings={settings} accordion={accordion} />
      <BackupRestoreSection appData={appData} actions={actions} backupReminder={backupReminder} setReceiptStats={setReceiptStats} settings={settings} accordion={accordion} />
      <ActivityLogSection appData={appData} accordion={accordion} />
      <MonthCloseSection appData={appData} actions={actions} selectedMonth={selectedMonth} settings={settings} accordion={accordion} />
      <BudgetTemplatesSection appData={appData} actions={actions} selectedMonth={selectedMonth} accordion={accordion} />
      <PlannedTransactionsSection appData={appData} actions={actions} accordion={accordion} />
      <AboutSection actions={actions} accordion={accordion} />
      <InstallAppSection actions={actions} accordion={accordion} />
      <ExampleDataSection appData={appData} actions={actions} accordion={accordion} />
      <DangerZoneSection actions={actions} settings={settings} accordion={accordion} />
      <SuggestionsSection appData={appData} actions={actions} cloudConfigured={cloudConfigured} cloudSession={cloudSession} settings={settings} accordion={accordion} />
    </div>
  );
}
