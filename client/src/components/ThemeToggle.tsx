import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Theme: Auto", light: "Theme: Light", dark: "Theme: Dark" };

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("offcuts-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("offcuts-theme", theme);
    } catch {
      // Storage can be blocked. The theme still works for this visit.
    }
  }, [theme]);

  return (
    <button className="btn btn-ghost" title="Change theme" onClick={() => setTheme(NEXT[theme])}>
      {LABEL[theme]}
    </button>
  );
}
