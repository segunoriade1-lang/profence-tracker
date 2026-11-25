"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./Icons";

type Mode = "light" | "dark";

/** The theme on screen now: the saved choice, otherwise the device setting. */
function current(): Mode {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** One button that flips between light and dark. Follows the device until it's first used. */
export default function ThemeSwitch() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    setMode(current());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setMode(current());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Mode = (mode ?? current()) === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setMode(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

  const label = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {mode === "dark" ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  );
}
