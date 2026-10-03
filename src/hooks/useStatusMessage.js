import { useRef, useState } from "react";

export const STATUS_MESSAGE_DURATION_MS = 4000;
export const STATUS_ERROR_DURATION_MS = 8000;

// Short status message under the header, e.g. "Backup saved.", that clears
// itself after a few seconds.
export default function useStatusMessage() {
  const [statusMessage, setStatusMessage] = useState("");
  const statusTimerRef = useRef(null);

  function notify(message, durationMs = STATUS_MESSAGE_DURATION_MS) {
    window.clearTimeout(statusTimerRef.current);
    setStatusMessage(message);
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(""), durationMs);
  }

  return { statusMessage, notify };
}
