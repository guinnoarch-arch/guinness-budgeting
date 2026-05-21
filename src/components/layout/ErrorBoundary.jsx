import React from "react";
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
      errorMessage: error?.message || "Unknown app error"
    };
  }

  componentDidCatch(error, info) {
    console.error("GH Budgeting caught render error:", error, info);
  }

  async exportEmergencyBackup() {
    this.setState({ backupStatus: "Preparing raw data export..." });
    try {
      const result = await exportRawSavedData();
      this.setState({ backupStatus: result.ok ? "Raw data backup exported." : "Backup was cancelled." });
    } catch (error) {
      console.error("Emergency backup failed:", error);
      this.setState({ backupStatus: "Emergency backup failed. Try copying localStorage manually from DevTools." });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="error-boundary-page">
        <section className="card error-boundary-card">
          <p className="eyebrow">App safety mode</p>
          <h1>Something in the app crashed</h1>
          <p className="muted-text">
            Your saved data has not been deleted. Export a raw backup before refreshing if you have entered important data.
          </p>
          <div className="warning-row orange">
            <strong>Error</strong>
            <small>{this.state.errorMessage}</small>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => this.exportEmergencyBackup()}>
              Export raw backup
            </button>
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
          {this.state.backupStatus && <p className="muted-text">{this.state.backupStatus}</p>}
        </section>
      </main>
    );
  }
}
