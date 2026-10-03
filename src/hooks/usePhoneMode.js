import { useEffect, useState } from "react";

const PHONE_MODE_STORAGE_KEY = "ghBudgetingPhoneMode";

function readStoredPhoneMode() {
  try {
    return window.localStorage.getItem(PHONE_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// The compact "Phone view" layout, remembered on this device.
export default function usePhoneMode() {
  const [phoneMode, setPhoneMode] = useState(readStoredPhoneMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(PHONE_MODE_STORAGE_KEY, phoneMode ? "true" : "false");
    } catch {
      // Cosmetic preference only; ignore storage failures.
    }
  }, [phoneMode]);

  return [phoneMode, setPhoneMode];
}
