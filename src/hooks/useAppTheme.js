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
  // clipped to the shape of the button, and a wave travels on through the
  // page. Only runs while Liquid Glass is on and the device has not asked for
  // reduced motion.
  //
  // Timing follows how Material Design and MUI build theirs, slowed down for
  // the glass look:
  // - The drop is sized to just reach the farthest corner (plus a little
  //   padding), so the wavefront is visibly travelling for the whole animation.
  //   Oversizing it makes the front cross the button in a blink and leaves a
  //   long fade of an already-flooded button, which feels fast and small.
  // - Growing and fading are separate animations: it keeps spreading while it
  //   is still bright, and only fades in the second half.
  // - Bigger buttons take longer, so the spread speed looks about the same on
  //   a small icon button and a wide one.
  const DROP_PADDING_PX = 12;
  const DROP_MIN_MS = 900;
  const DROP_MAX_MS = 1600;
  const DROP_BASE_MS = 650;
  const DROP_MS_PER_PX = 5;

  // Page wave: on top of the button drop, a few soft rings spread from the
  // press point right across the whole screen, like a drop landing on water
  // under the page. They are sized to reach the farthest screen corner, and
  // take longer the farther that is, so the spread speed looks the same on a
  // phone and a big monitor. The first ring also blurs and brightens what is
  // behind it slightly, which is what makes it read as a lens moving through
  // the page rather than a coloured circle.
  const WAVE_MIN_MS = 1500;
  const WAVE_MAX_MS = 3200;
  const WAVE_BASE_MS = 800;
  const WAVE_MS_PER_PX = 2;
  const WAVE_STAGGER_MS = 170;
  const WAVE_RING_STRENGTHS = [1, 0.65, 0.4];

  useEffect(() => {
    if (!settings?.liquidGlassEnabled) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    function playPageWave(pressX, pressY) {
      // Farthest screen corner from the press: the crest has to get that far.
      const width = window.innerWidth;
      const height = window.innerHeight;
      const reach = Math.max(
        Math.hypot(pressX, pressY),
        Math.hypot(width - pressX, pressY),
        Math.hypot(pressX, height - pressY),
        Math.hypot(width - pressX, height - pressY)
      );
      // The bright crest sits about 93% of the way out in each ring, so grow
      // the ring a little past the corner for the crest to land on it.
      const size = (reach / 0.9 + 20) * 2;
      const durationMs = Math.round(Math.min(WAVE_MAX_MS, Math.max(WAVE_MIN_MS, WAVE_BASE_MS + reach * WAVE_MS_PER_PX)));

      const wave = document.createElement("span");
      wave.className = "glass-wave";
      wave.setAttribute("aria-hidden", "true");

      WAVE_RING_STRENGTHS.forEach((strength, index) => {
        const ring = document.createElement("i");
        if (index === 0) ring.className = "glass-wave-lens";
        ring.style.setProperty("--wave-size", `${size}px`);
        ring.style.setProperty("--wave-ms", `${durationMs}ms`);
        ring.style.setProperty("--wave-delay", `${index * WAVE_STAGGER_MS}ms`);
        ring.style.setProperty("--wave-strength", String(strength));
        ring.style.left = `${pressX}px`;
        ring.style.top = `${pressY}px`;
        wave.appendChild(ring);
      });

      document.body.appendChild(wave);

      // A touch that turns into a scroll should not set off a screen-wide wave.
      function remove() {
        wave.remove();
        document.removeEventListener("pointercancel", remove, true);
      }
      document.addEventListener("pointercancel", remove, { capture: true, once: true });
      window.setTimeout(remove, durationMs + WAVE_STAGGER_MS * (WAVE_RING_STRENGTHS.length - 1) + 300);
    }

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

      // Distance from the press to the farthest corner: the drop only has to
      // grow this far to cover the whole button.
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const reach = Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      );
      const size = (reach + DROP_PADDING_PX) * 2;
      const durationMs = Math.round(Math.min(DROP_MAX_MS, Math.max(DROP_MIN_MS, DROP_BASE_MS + reach * DROP_MS_PER_PX)));

      const drop = document.createElement("i");
      drop.style.setProperty("--drop-size", `${size}px`);
      drop.style.setProperty("--drop-ms", `${durationMs}ms`);
      drop.style.left = `${x}px`;
      drop.style.top = `${y}px`;
      wrapper.appendChild(drop);

      document.body.appendChild(wrapper);
      playPageWave(event.clientX, event.clientY);

      // The drop is fixed to the screen, so if the page scrolls (or the touch
      // turns into a scroll) while it plays, drop it rather than let it drift.
      function remove() {
        wrapper.remove();
        window.removeEventListener("scroll", remove, true);
        document.removeEventListener("pointercancel", remove, true);
      }
      drop.addEventListener("animationend", animationEvent => {
        if (animationEvent.animationName === "glass-drop-fade") remove();
      });
      window.addEventListener("scroll", remove, { capture: true, passive: true, once: true });
      document.addEventListener("pointercancel", remove, { capture: true, once: true });
      window.setTimeout(remove, durationMs + 400);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [settings?.liquidGlassEnabled]);
}
