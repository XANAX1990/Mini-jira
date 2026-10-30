import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

async function headersFor(source: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === source);
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

describe("security headers (SECURITY.md: Infrastructure)", () => {
  it("every path forbids framing, sniffing and long Referers", async () => {
    const h = await headersFor("/:path*");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("does not turn on a script policy that could break Auth.js or the theme script", async () => {
    const csp = (await headersFor("/:path*"))["Content-Security-Policy"];
    expect(csp).not.toMatch(/script-src|default-src/);
  });

  it("protected pages are still never stored by the browser", async () => {
    expect((await headersFor("/projects/:path*"))["Cache-Control"]).toBe("no-store");
  });
});
