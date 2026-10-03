import { useEffect } from "react";
import { darkenHexColour, hexToRgb, resolveThemeMode, sanitiseHexColour } from "../utils/theme.js";

// Keeps the page's light/dark mode and accent colour in step with Settings,
// including following the device when the mode is "system".
export default function useAppTheme(settings) {
  useEffect(() => {
    if (!settings) return undefined;
    const themeMode = settings?.themeMode || (settings?.darkModeEnabled ? "dark" : "light");
    const accentColor = sanitiseHexColour(settings?.accentColor || "#0b5d45");
    const accentDark = darkenHexColour(accentColor, 0.24);
    const { r, g, b } = hexToRgb(accentColor);

    function applyTheme() {
      document.documentElement.setAttribute("data-theme", resolveThemeMode(themeMode));
      document.documentElement.setAttribute("data-theme-mode", themeMode);
      document.documentElement.style.setProperty("--primary", accentColor);
      document.documentElement.style.setProperty("--primary-dark", accentDark);
      document.documentElement.style.setProperty("--primary-rgb", `${r}, ${g}, ${b}`);
    }

    applyTheme();

    if (themeMode !== "system" || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener?.("change", applyTheme);
    return () => mediaQuery.removeEventListener?.("change", applyTheme);
  }, [settings?.themeMode, settings?.darkModeEnabled, settings?.accentColor]);
}
