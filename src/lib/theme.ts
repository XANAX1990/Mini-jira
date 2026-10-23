// Theme choice: "light", "dark", or "system" (follow the OS). Plain module so the server layout
// and the client toggle can share it. Only "light" and "dark" are stored; no value means system.

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Anything that is not a stored "light" or "dark" is the system setting. */
export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** Whether the page should be dark for this choice and this OS setting. */
export function resolveTheme(theme: Theme, systemDark: boolean): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

/**
 * Runs in <head> before the first paint, so the page never shows the wrong theme for a moment.
 * It must not throw: private modes and locked-down browsers can make `localStorage` fail, and
 * then the OS setting decides. Kept as plain ES5 text on purpose (it is inlined as-is); the
 * free names `localStorage`, `matchMedia` and `document` are passed in by the tests.
 */
export const themeScript = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}var d=t==="dark"||(t!=="light"&&typeof matchMedia==="function"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);document.documentElement.classList.toggle("dark",d)})()`;
