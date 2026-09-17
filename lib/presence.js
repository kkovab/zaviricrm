"use client";

// Small helpers for the "who else is here" live-presence feature. No
// accounts - each browser just remembers a name locally, and gets a color
// derived from that name so it's consistent across sessions/tabs.

const NAME_KEY = "zaviri_presence_name";

const COLORS = [
  "#f01546", // brand red
  "#0ea5e9", // sky
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#f97316", // orange
  "#14b8a6", // teal
  "#ec4899", // pink
];

export function getStoredName() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredName(name) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Worst case they just get asked for their name again next visit.
  }
}

export function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}
