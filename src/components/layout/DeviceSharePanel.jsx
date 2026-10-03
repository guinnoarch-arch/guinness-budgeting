import InlineQrCode from "../common/InlineQrCode.jsx";

// QR code and link for opening the app on a phone.
export function DeviceSharePanel({ copyShareLink, deviceShare, setShowDeviceShare, shareCopyStatus, shareUrl }) {
  return (
    <div className="device-share-panel" role="dialog" aria-label="Open app on another device">
      <div className="notification-panel-header">
        <strong>Open on phone</strong>
        <button type="button" className="text-button" onClick={() => setShowDeviceShare(false)}>Close</button>
      </div>
      <p className="muted">Scan this QR code on your phone, then sign in and restore the latest cloud backup if this device has newer data.</p>
      {shareUrl ? (
        <div className="device-qr-card">
          <InlineQrCode value={shareUrl} size={280} />
        </div>
      ) : (
        <div className="cloud-status-message compact-status warning-status">
          A valid app link could not be found. Set VITE_PUBLIC_APP_URL to the public production Vercel app link.
        </div>
      )}
      {deviceShare.needsDeployedUrl && shareUrl && (
        <div className="cloud-status-message compact-status warning-status">
          {deviceShare.isPreviewRuntime
            ? "This looks like a Vercel preview/dashboard URL, so the QR uses the stable production app link."
            : deviceShare.isLocalRuntime || deviceShare.isPrivateRuntime
              ? "You are running locally or on a private URL, so the QR uses the stable production app link."
              : "Test the phone QR from the stable production app URL."}
        </div>
      )}
      {!deviceShare.isLocalRuntime && deviceShare.usingConfiguredUrl && (
        <div className="cloud-status-message compact-status">
          This QR uses the configured stable production URL, so phones avoid preview deployments and Vercel dashboard links.
        </div>
      )}
      <input className="device-share-link" value={shareUrl} readOnly aria-label="App link" />
      <div className="row-actions cloud-action-row">
        <button type="button" className="secondary-button small" onClick={copyShareLink} disabled={!shareUrl}>Copy link</button>
        {shareUrl && <a className="secondary-button small" href={shareUrl} target="_blank" rel="noreferrer">Open link</a>}
      </div>
      {shareCopyStatus && <p className="cloud-status-message compact-status">{shareCopyStatus}</p>}
    </div>
  );
}
