"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "zaviri-theme";

export default function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "dark");
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_KEY, nextTheme);
    setTheme(nextTheme);
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle ${compact ? "theme-toggle--compact" : ""}`}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Dark mode" : "Light mode"}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__icon theme-toggle__icon--sun">
          <svg viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.35 4.35l1.4 1.4M14.25 14.25l1.4 1.4M15.65 4.35l-1.4 1.4M5.75 14.25l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <span className="theme-toggle__icon theme-toggle__icon--moon">
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M15.5 12.9A6.7 6.7 0 0 1 7.1 4.5a6.7 6.7 0 1 0 8.4 8.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="theme-toggle__thumb" />
      </span>
      {!compact && <span>{isLight ? "Light" : "Dark"}</span>}
    </button>
  );
}
