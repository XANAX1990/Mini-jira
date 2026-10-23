"use client";

import { useSyncExternalStore } from "react";
import { DARK_QUERY, THEME_KEY, parseTheme, resolveTheme, type Theme } from "@/lib/theme";

// The stored choice is an external store (localStorage + the OS setting), so React reads it with
// useSyncExternalStore: the server renders "system", the browser then shows the real choice, and
// changes from another tab or from the OS update every toggle on the page.

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function applyTheme() {
  const systemDark = typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
  document.documentElement.classList.toggle("dark", resolveTheme(readTheme(), systemDark) === "dark");
}

function chooseTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the choice still applies to this page, it just isn't remembered.
  }
  applyTheme();
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onChange = () => {
    applyTheme();
    notify();
  };
  const media = typeof matchMedia === "function" ? matchMedia(DARK_QUERY) : null;
  window.addEventListener("storage", onChange);
  media?.addEventListener("change", onChange);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onChange);
    media?.removeEventListener("change", onChange);
  };
}

const icon = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const OPTIONS: { value: Theme; label: string; svg: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    svg: (
      <svg {...icon}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    svg: (
      <svg {...icon}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    svg: (
      <svg {...icon}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            aria-pressed={active}
            title={o.label}
            onClick={() => chooseTheme(o.value)}
            className={`rounded p-1.5 ${
              active
                ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {o.svg}
          </button>
        );
      })}
    </div>
  );
}
