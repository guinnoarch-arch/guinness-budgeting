import React from "react";
import { logError } from "../../utils/logger.js";
import { exportRawSavedData } from "../../services/storageService.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
      backupStatus: ""
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || "No details were given."
    };
  }

  componentDidCatch(error, info) {
    // Kept so a crash can still be diagnosed from the browser console.
    logError("GH Budgeting caught render error", error, info);
  }

  async exportEmergencyBackup() {
    this.setState({ backupStatus: "Preparing a copy of your saved data…" });
    try {
      const result = await exportRawSavedData();
      this.setState({ backupStatus: result.ok ? "Copy of your saved data downloaded." : "Download cancelled. Your data is still saved in this browser." });
    } catch {
      this.setState({ backupStatus: "The copy couldn't be downloaded. Your data is still saved in this browser — reload the app and export a backup from Settings." });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="error-boundary-page">
        <section className="card error-boundary-card">
          <p className="eyebrow">Something stopped working</p>
          <h1>Sorry — this screen hit a problem and couldn't be shown</h1>
          <p className="muted-text">
            Your saved data hasn't been changed or deleted. Reloading the app usually fixes this.
            If it keeps happening, download a copy of your data first so nothing is at risk.
          </p>
          <div className="row-actions">
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              Reload app
            </button>
            <button type="button" className="secondary-button" onClick={() => this.exportEmergencyBackup()}>
              Download a copy of my data
            </button>
          </div>
          {this.state.backupStatus && <p className="muted-text" role="status">{this.state.backupStatus}</p>}
          <details className="technical-details">
            <summary>Technical details</summary>
            <small>{this.state.errorMessage}</small>
          </details>
        </section>
      </main>
    );
  }
}
