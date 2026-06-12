import { useMemo } from "react";
import QRCode from "qrcode";

const QUIET_ZONE_MODULES = 4;

function buildModulePath(modules) {
  const parts = [];
  const data = modules.data || [];

  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (data[y * modules.size + x]) {
        parts.push(`M${x + QUIET_ZONE_MODULES},${y + QUIET_ZONE_MODULES}h1v1h-1z`);
      }
    }
  }

  return parts.join("");
}

export default function InlineQrCode({ value, size = 280, className = "" }) {
  const qr = useMemo(() => {
    const text = String(value || "").trim();
    if (!text) return null;

    try {
      const qrCode = QRCode.create(text, {
        errorCorrectionLevel: "M",
        version: undefined
      });

      return {
        path: buildModulePath(qrCode.modules),
        viewBoxSize: qrCode.modules.size + (QUIET_ZONE_MODULES * 2)
      };
    } catch (error) {
      console.warn("Could not generate QR code:", error);
      return null;
    }
  }, [value]);

  if (!qr) {
    return (
      <div className={`inline-qr-error ${className}`.trim()} role="status">
        QR code unavailable
      </div>
    );
  }

  return (
    <svg
      className={`inline-qr-code ${className}`.trim()}
      viewBox={`0 0 ${qr.viewBoxSize} ${qr.viewBoxSize}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code for app link"
      shapeRendering="crispEdges"
    >
      <rect width={qr.viewBoxSize} height={qr.viewBoxSize} fill="#ffffff" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}
