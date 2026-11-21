"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "./Icons";

type Theme = "light" | "dark" | "system";
const KEY = THEME_KEY;

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const options: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light mode", Icon: SunIcon },
  { value: "dark", label: "Dark mode", Icon: MoonIcon },
  { value: "system", label: "Match device", Icon: MonitorIcon },
];

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    apply(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {}
  }

  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
