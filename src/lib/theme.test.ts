import { describe, expect, it } from "vitest";
import { DARK_QUERY, THEME_KEY, parseTheme, resolveTheme, themeScript } from "@/lib/theme";

describe("parseTheme", () => {
  it("accepts only light and dark; everything else is the system setting", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    for (const junk of [null, undefined, "", "Dark", "LIGHT", "blue", " dark", "true"]) {
      expect(parseTheme(junk as string | null | undefined)).toBe("system");
    }
  });
});

describe("resolveTheme", () => {
  it("a stored choice wins over the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("system follows the OS", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

// Runs the real inline script against fake browser objects.
function run(opts: { stored?: string | null; systemDark?: boolean; storageThrows?: boolean; noMatchMedia?: boolean }) {
  const classes = new Set<string>();
  const document = {
    documentElement: {
      classList: {
        toggle: (name: string, force?: boolean) => {
          const on = force ?? !classes.has(name);
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
      },
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (opts.storageThrows) throw new Error("SecurityError");
      expect(key).toBe(THEME_KEY);
      return opts.stored ?? null;
    },
  };
  const matchMedia = opts.noMatchMedia
    ? undefined
    : (query: string) => {
        expect(query).toBe(DARK_QUERY);
        return { matches: !!opts.systemDark };
      };
  new Function("localStorage", "matchMedia", "document", themeScript)(localStorage, matchMedia, document);
  return classes.has("dark");
}

describe("inline theme script", () => {
  it("stored dark is dark, whatever the OS says", () => {
    expect(run({ stored: "dark", systemDark: false })).toBe(true);
    expect(run({ stored: "dark", systemDark: true })).toBe(true);
  });
  it("stored light is light, even when the OS is dark", () => {
    expect(run({ stored: "light", systemDark: true })).toBe(false);
    expect(run({ stored: "light", systemDark: false })).toBe(false);
  });
  it("nothing stored follows the OS", () => {
    expect(run({ stored: null, systemDark: true })).toBe(true);
    expect(run({ stored: null, systemDark: false })).toBe(false);
  });
  it("an unknown stored value follows the OS", () => {
    expect(run({ stored: "purple", systemDark: true })).toBe(true);
    expect(run({ stored: "purple", systemDark: false })).toBe(false);
  });
  it("does not throw when storage is blocked, and falls back to the OS", () => {
    expect(run({ storageThrows: true, systemDark: true })).toBe(true);
    expect(run({ storageThrows: true, systemDark: false })).toBe(false);
  });
  it("does not throw without matchMedia: light, unless dark is stored", () => {
    expect(run({ stored: null, noMatchMedia: true })).toBe(false);
    expect(run({ stored: "dark", noMatchMedia: true })).toBe(true);
  });
  it("is a self-contained expression with no template leftovers", () => {
    expect(themeScript).not.toContain("${");
    expect(themeScript.startsWith("(function(){")).toBe(true);
    expect(themeScript.endsWith("})()")).toBe(true);
  });
});
