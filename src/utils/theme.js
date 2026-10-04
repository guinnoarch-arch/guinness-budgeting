// Applies the chosen accent colour and light/dark mode to the page.

export const DEFAULT_ACCENT_COLOUR = "#a8843f";
export const LEGACY_DEFAULT_ACCENT_COLOUR = "#0b5d45";

// Brand colours offered in Settings > Appearance. Harp gold and bottle green
// come from the GH logo; the others are muted partners that sit well on
// cream and near-black.
export const ACCENT_PRESETS = [
  { name: "Harp gold", value: "#a8843f" },
  { name: "Bottle green", value: "#2f5d47" },
  { name: "GH logo green", value: "#0b5d45" },
  { name: "Claret", value: "#7d2f3a" },
  { name: "Slate blue", value: "#4e6f8e" },
  { name: "Ink", value: "#2b2a26" }
];

export function sanitiseHexColour(value, fallback = DEFAULT_ACCENT_COLOUR) {
  const text = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

export function hexToRgb(hex) {
  const clean = sanitiseHexColour(hex).replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function toHex(channels) {
  return `#${channels.map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
}

export function darkenHexColour(hex, amount = 0.22) {
  const { r, g, b } = hexToRgb(hex);
  return toHex([r, g, b].map(channel => channel * (1 - amount)));
}

export function lightenHexColour(hex, amount = 0.3) {
  const { r, g, b } = hexToRgb(hex);
  return toHex([r, g, b].map(channel => channel + (255 - channel) * amount));
}

// WCAG relative luminance, used to pick readable text for the accent.
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const INK = "#1c1b18";
const CREAM = "#fcfaf5";

// Text colour to put on top of the accent: whichever of ink or cream reads better.
export function readableTextOn(hex) {
  return contrastRatio(hex, INK) >= contrastRatio(hex, CREAM) ? INK : CREAM;
}

// A version of the accent dark or light enough to use as text on the page
// background (at least 4.5:1).
export function accentTextColour(hex, mode) {
  const background = mode === "dark" ? "#1b1a17" : CREAM;
  let colour = sanitiseHexColour(hex);
  for (let step = 0; step < 12 && contrastRatio(colour, background) < 4.5; step += 1) {
    colour = mode === "dark" ? lightenHexColour(colour, 0.15) : darkenHexColour(colour, 0.12);
  }
  return colour;
}

export function resolveThemeMode(themeMode) {
  if (themeMode === "dark") return "dark";
  if (themeMode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}
