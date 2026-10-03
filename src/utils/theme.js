// Applies the chosen accent colour and light/dark mode to the page.

export function sanitiseHexColour(value, fallback = "#0b5d45") {
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

export function darkenHexColour(hex, amount = 0.22) {
  const { r, g, b } = hexToRgb(hex);
  const next = [r, g, b].map(channel => Math.max(0, Math.round(channel * (1 - amount))));
  return `#${next.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function resolveThemeMode(themeMode) {
  if (themeMode === "dark") return "dark";
  if (themeMode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}
