export default function PhoneModeToggle({ phoneMode, onToggle }) {
  return (
    <button
      type="button"
      className={`secondary-button phone-mode-toggle ${phoneMode ? "active" : ""}`}
      onClick={onToggle}
      aria-pressed={phoneMode}
      title={phoneMode ? "Return to desktop layout" : "Use compact phone-friendly layout"}
    >
      {phoneMode ? "Desktop view" : "Phone view"}
    </button>
  );
}
