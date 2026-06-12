export function abbreviateMonthLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const relativeLabels = {
    "2 months ago": "2 mo",
    "Last month": "Last",
    "This month": "This"
  };
  if (relativeLabels[text]) return relativeLabels[text];

  const firstToken = text.split(/\s+/)[0] || text;
  return firstToken.length > 3 ? firstToken.slice(0, 3) : firstToken;
}

export function smallMonthXAxisProps() {
  return {
    interval: 0,
    tickFormatter: abbreviateMonthLabel,
    angle: -40,
    textAnchor: "end",
    height: 58,
    tickMargin: 8
  };
}
