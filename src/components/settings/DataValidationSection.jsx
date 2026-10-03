import { useState } from "react";
import { logWarning } from "../../utils/logger.js";
import AsyncButton from "../common/AsyncButton.jsx";
import { repairSafeAppDataIssues, validateCurrentAppData } from "../../services/dataValidationService.js";
import { addStorageLog } from "../../services/indexedDbStorageService.js";
import { formatDateTime } from "./settingsHelpers.jsx";

function SeverityPill({ severity }) {
  const label = severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Info";
  return <span className={`pill validation-${severity || "info"}`}>{label}</span>;
}

function ValidationIssueList({ report }) {
  if (!report) {
    return <p className="muted-text">Run a check to scan transactions, categories, budgets, loans, recurring items and links.</p>;
  }

  if (!report.issues.length) {
    return <p className="storage-good-message">No data issues found.</p>;
  }

  return (
    <div className="validation-issue-list">
      {report.issues.slice(0, 80).map(issue => (
        <div key={issue.id} className={`validation-issue-row ${issue.severity}`}>
          <div>
            <strong>{issue.title}</strong>
            <p>{issue.detail}</p>
            {issue.repairable && <small>Safe repair: {issue.repairDescription}</small>}
          </div>
          <SeverityPill severity={issue.severity} />
        </div>
      ))}
      {report.issues.length > 80 && <p className="muted-text">Showing first 80 issues. Repair/export before doing more changes.</p>}
    </div>
  );
}

export default function DataValidationSection({ appData, actions, refreshStorageLogList, settings, accordion }) {
  const { sectionClass, sectionHeaderProps, SectionChevron } = accordion;
  const [validationReport, setValidationReport] = useState(null);
  const [validationStatus, setValidationStatus] = useState("");

  function runDataValidation() {
    const report = validateCurrentAppData(appData);
    setValidationReport(report);
    setValidationStatus(report.issues.length
      ? `${report.summary.totalIssues} issue(s) found. ${report.summary.repairableCount} can be safely repaired.`
      : "No data issues found.");

    actions.updateAppData({
      ...appData,
      settings: {
        ...settings,
        lastValidationReportAt: report.createdAt,
        lastValidationIssueCount: report.summary.totalIssues,
        lastValidationErrorCount: report.summary.errorCount,
        lastValidationWarningCount: report.summary.warningCount
      }
    }, { reason: "Data validation checked", markDirty: false });
  }

  async function repairValidationIssues() {
    const report = validationReport || validateCurrentAppData(appData);
    const repairableCount = report.summary?.repairableCount || 0;

    if (!repairableCount) {
      setValidationStatus("Nothing can be repaired automatically. Fix the remaining issues listed above by hand.");
      return;
    }

    if (!confirm(`Apply ${repairableCount} safe automatic repair(s)? Export a backup first if you have not done one recently.`)) return;

    const result = repairSafeAppDataIssues(appData, report);
    setValidationReport(result.nextReport);
    setValidationStatus(result.repairs.length
      ? `Applied ${result.repairs.length} repair(s). Recheck result: ${result.nextReport.summary.totalIssues} issue(s) remain.`
      : "No changes were needed.");

    try {
      await addStorageLog({
        level: "warning",
        event: "validation_safe_repair",
        message: `Applied ${result.repairs.length} safe data repair(s).`,
        details: { repairs: result.repairs.slice(0, 50) }
      });
      await refreshStorageLogList();
    } catch (error) {
      logWarning("Could not write validation repair log", error);
    }

    actions.updateAppData({
      ...result.data,
      settings: {
        ...(result.data.settings || {}),
        lastValidationReportAt: result.nextReport.createdAt,
        lastValidationIssueCount: result.nextReport.summary.totalIssues,
        lastValidationErrorCount: result.nextReport.summary.errorCount,
        lastValidationWarningCount: result.nextReport.summary.warningCount
      }
    }, { reason: "Safe data repair applied", major: true });
  }

  return (
    <section className={sectionClass("validation", "data-validation-card")}>
      <div className="section-header compact-header settings-accordion-heading" {...sectionHeaderProps("validation")}>
        <div>
          <h3>Data validation and repair</h3>
        </div>
        <div className="settings-accordion-heading-side">
          <span className={validationReport?.issues?.length ? "pill storage-bad" : "pill storage-ok"}>
            {validationReport ? `${validationReport.summary.totalIssues} issue(s)` : "Not checked"}
          </span>
          <SectionChevron sectionId="validation" />
        </div>
      </div>

      <div className="row-actions">
        <button type="button" className="primary-button" onClick={runDataValidation}>Check app data</button>
        <AsyncButton busyLabel="Repairing…"
          type="button"
          className="secondary-button"
          onClick={repairValidationIssues}
          disabled={!validationReport || !validationReport.summary.repairableCount}
        >
          Repair safe issues
        </AsyncButton>
      </div>

      {validationStatus && <p className="storage-validation-status">{validationStatus}</p>}

      <div className="storage-health-grid validation-summary-grid">
        <p><span>Last check</span><strong>{formatDateTime(settings.lastValidationReportAt)}</strong></p>
        <p><span>Last repair</span><strong>{formatDateTime(settings.lastValidationRepairAt)}</strong></p>
        <p><span>Last repair count</span><strong>{settings.lastValidationRepairCount ?? 0}</strong></p>
        <p><span>Remaining last issue count</span><strong>{settings.lastValidationIssueCount ?? "Not checked"}</strong></p>
      </div>

      <ValidationIssueList report={validationReport} />
    </section>
  );
}
