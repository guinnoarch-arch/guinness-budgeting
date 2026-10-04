import { useEffect } from "react";
import { DEFAULT_ACCENT_COLOUR, accentTextColour, darkenHexColour, hexToRgb, readableTextOn, resolveThemeMode, sanitiseHexColour } from "../utils/theme.js";

// Keeps the page's light/dark mode and accent colour in step with Settings,
// including following the device when the mode is "system".
export default function useAppTheme(settings) {
  useEffect(() => {
    if (!settings) return undefined;
    const themeMode = settings?.themeMode || (settings?.darkModeEnabled ? "dark" : "light");
    const accentColor = sanitiseHexColour(settings?.accentColor || DEFAULT_ACCENT_COLOUR);
    const accentDark = darkenHexColour(accentColor, 0.18);
    const { r, g, b } = hexToRgb(accentColor);

    function applyTheme() {
      const mode = resolveThemeMode(themeMode);
      const root = document.documentElement;
      root.setAttribute("data-theme", mode);
      root.setAttribute("data-theme-mode", themeMode);
      root.style.setProperty("--primary", accentColor);
      root.style.setProperty("--primary-dark", accentDark);
      root.style.setProperty("--primary-rgb", `${r}, ${g}, ${b}`);
      root.style.setProperty("--on-primary", readableTextOn(accentColor));
      root.style.setProperty("--accent-text", accentTextColour(accentColor, mode));
    }

    applyTheme();

    if (themeMode !== "system" || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener?.("change", applyTheme);
    return () => mediaQuery.removeEventListener?.("change", applyTheme);
  }, [settings?.themeMode, settings?.darkModeEnabled, settings?.accentColor]);
}
