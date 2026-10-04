import { useEffect, useRef, useState } from "react";

// A button for actions that take time (network, file saves). It disables
// itself while the action runs so a double-click can't run it twice, and
// shows `busyLabel` meanwhile. The action is responsible for showing its
// own success or error message.
export default function AsyncButton({ onClick, busyLabel = "", children, disabled = false, type = "button", ...buttonProps }) {
  const [isBusy, setIsBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  async function handleClick(event) {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await onClick?.(event);
    } catch (error) {
      // Actions handle expected failures themselves; this only catches bugs,
      // so they're visible in the console rather than an unhandled rejection.
      console.error("Action failed:", error);
    } finally {
      if (isMountedRef.current) setIsBusy(false);
    }
  }

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      onClick={handleClick}
    >
      {isBusy && busyLabel ? busyLabel : children}
    </button>
  );
}
