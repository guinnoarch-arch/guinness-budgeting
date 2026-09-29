import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { ResponsiveContainer } from "recharts";

// Wraps a Recharts chart (pass the chart element — <LineChart>, <PieChart>…
// — as the only child) so it can be opened full screen. Inline it renders
// exactly as before at `height`. Full screen it fills the viewport: it uses
// the browser's real fullscreen mode where available (and, on phones that
// allow it, turns to landscape); otherwise — e.g. an iPhone — it's a
// full-window overlay with a hint to turn the phone sideways.
export default function ExpandableChart({ title, height = 300, children }) {
  const [expanded, setExpanded] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!expanded) return undefined;

    const overlay = overlayRef.current;
    let enteredNativeFullscreen = false;
    try {
      const request = overlay?.requestFullscreen?.({ navigationUI: "hide" });
      if (request && typeof request.then === "function") {
        request.then(() => {
          enteredNativeFullscreen = true;
          // Only works once in fullscreen, and only on some phones; a
          // failure just means the user rotates the phone themselves.
          window.screen?.orientation?.lock?.("landscape").catch(() => {});
        }).catch(() => {});
      }
    } catch {
      // Overlay-only fallback is fine.
    }

    const updateOrientation = () => setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 700);
    updateOrientation();

    const onKey = event => {
      if (event.key === "Escape") setExpanded(false);
    };
    // Leaving native fullscreen (back gesture, Esc) closes the overlay too.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && enteredNativeFullscreen) setExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      try {
        window.screen?.orientation?.unlock?.();
      } catch {
        // Nothing to undo.
      }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [expanded]);

  return (
    <div className="expandable-chart">
      <button
        type="button"
        className="icon-button expandable-chart-button"
        onClick={() => setExpanded(true)}
        aria-label={`Open ${title || "chart"} full screen`}
        title="Full screen"
      >
        <Maximize2 size={16} />
      </button>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>

      {expanded && createPortal(
        <div className="chart-fullscreen-overlay" ref={overlayRef} role="dialog" aria-modal="true" aria-label={title || "Chart"}>
          <div className="chart-fullscreen-header">
            <strong>{title}</strong>
            <button type="button" className="icon-button" onClick={() => setExpanded(false)} aria-label="Close full screen">
              <X size={18} />
            </button>
          </div>
          {portrait && <p className="chart-fullscreen-hint">Turn your phone sideways for a wider chart.</p>}
          <div className="chart-fullscreen-body">
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
