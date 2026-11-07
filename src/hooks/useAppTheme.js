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
    const glassOn = Boolean(settings?.liquidGlassEnabled);
    const { r, g, b } = hexToRgb(accentColor);

    function applyTheme() {
      const mode = resolveThemeMode(themeMode);
      const root = document.documentElement;
      root.setAttribute("data-theme", mode);
      root.setAttribute("data-theme-mode", themeMode);
      root.setAttribute("data-glass", glassOn ? "on" : "off");
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
  }, [settings?.themeMode, settings?.darkModeEnabled, settings?.accentColor, settings?.liquidGlassEnabled]);

  // Liquid Glass press ripple: a glassy drop spreads out from the tap point,
  // clipped to the shape of the button. Only runs while Liquid Glass is on and
  // the device has not asked for reduced motion.
  useEffect(() => {
    if (!settings?.liquidGlassEnabled) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    function onPointerDown(event) {
      const target = event.target?.closest?.("button, .nav-item, [role='button'], a.primary-button, a.secondary-button");
      if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;

      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const wrapper = document.createElement("span");
      wrapper.className = "glass-drop";
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
      wrapper.style.borderRadius = window.getComputedStyle(target).borderRadius;

      const size = Math.hypot(rect.width, rect.height) * 2.2;
      const drop = document.createElement("i");
      drop.style.setProperty("--drop-size", `${size}px`);
      drop.style.left = `${event.clientX - rect.left}px`;
      drop.style.top = `${event.clientY - rect.top}px`;
      wrapper.appendChild(drop);

      document.body.appendChild(wrapper);
      drop.addEventListener("animationend", () => wrapper.remove(), { once: true });
      window.setTimeout(() => wrapper.remove(), 1000);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [settings?.liquidGlassEnabled]);
}
