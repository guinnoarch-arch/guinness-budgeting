// Colours for charts. Muted mid-tones that read on both the cream and the
// near-black theme. Axis text and grid lines use the surrounding text
// colour ("currentColor"), so they follow light and dark mode.

export const CHART_SERIES = [
  "#a8843f", // harp gold
  "#3d7a5a", // bottle green
  "#4e6f8e", // slate blue
  "#a24e4e", // brick
  "#7a6aa0", // heather
  "#5f8f8a", // sage teal
  "#b86f3c", // rust
  "#8a8578" // warm grey
];

export const CHART_MEANING = {
  income: "#3d7a5a",
  expenses: "#a24e4e",
  savings: "#a8843f",
  balance: "#4e6f8e"
};

export const AXIS_TICK = { fill: "currentColor", fontSize: 12 };
export const GRID_PROPS = { stroke: "currentColor", strokeOpacity: 0.12, strokeDasharray: "3 3" };
