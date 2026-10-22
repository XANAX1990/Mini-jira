import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { isHttpsRequest } from "@/lib/secure-request";

const SECRET = "test-secret-for-the-proxy-tests-0123456789";
process.env.AUTH_SECRET = SECRET;

import { proxy } from "@/proxy";

const HTTP_COOKIE = "authjs.session-token";
const HTTPS_COOKIE = "__Secure-authjs.session-token";

// Real tokens, encoded the way Auth.js does it (the salt is the cookie name), and the real getToken.
async function cookie(name: string) {
  const token = await encode({ token: { id: "507f1f77bcf86cd799439011", sub: "1" }, secret: SECRET, salt: name });
  return `${name}=${token}`;
}

function request(url: string, init: { cookie?: string; forwardedProto?: string } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.forwardedProto) headers.set("x-forwarded-proto", init.forwardedProto);
  return new NextRequest(url, { headers });
}

const redirectsTo = (res: Response) => (res.status >= 300 && res.status < 400 ? new URL(res.headers.get("location")!).pathname : null);

let httpSession: string;
let httpsSession: string;
beforeAll(async () => {
  httpSession = await cookie(HTTP_COOKIE);
  httpsSession = await cookie(HTTPS_COOKIE);
});

describe("isHttpsRequest", () => {
  const h = (value?: string) => new Headers(value ? { "x-forwarded-proto": value } : {});
  it("trusts x-forwarded-proto over the URL (behind Vercel the app sees http internally)", () => {
    expect(isHttpsRequest(h("https"), "http:")).toBe(true);
    expect(isHttpsRequest(h("http"), "https:")).toBe(false);
  });
  it("uses the first value of a proxy chain", () => {
    expect(isHttpsRequest(h("https, http"), "http:")).toBe(true);
    expect(isHttpsRequest(h("http,https"), "https:")).toBe(false);
  });
  it("falls back to the URL protocol", () => {
    expect(isHttpsRequest(h(), "https:")).toBe(true);
    expect(isHttpsRequest(h(), "http:")).toBe(false);
  });
});

describe("proxy on https (production): the session cookie is __Secure-authjs.session-token", () => {
  const base = "https://mini-jira-tan.vercel.app";

  it("lets a signed-in user into /projects instead of bouncing to /login (the login loop)", async () => {
    const res = await proxy(request(`${base}/projects`, { cookie: httpsSession }));
    expect(redirectsTo(res)).toBeNull();
  });

  it("sends a signed-in user from / and /login to /projects", async () => {
    expect(redirectsTo(await proxy(request(`${base}/`, { cookie: httpsSession })))).toBe("/projects");
    expect(redirectsTo(await proxy(request(`${base}/login`, { cookie: httpsSession })))).toBe("/projects");
  });

  it("works when the app itself sees http but x-forwarded-proto says https", async () => {
    const res = await proxy(request("http://localhost/projects", { cookie: httpsSession, forwardedProto: "https" }));
    expect(redirectsTo(res)).toBeNull();
  });

  it("sends a signed-out user to /login, and lets them see / and /login", async () => {
    expect(redirectsTo(await proxy(request(`${base}/projects`)))).toBe("/login");
    expect(redirectsTo(await proxy(request(`${base}/projects/MJ/settings`)))).toBe("/login");
    expect(redirectsTo(await proxy(request(`${base}/`)))).toBeNull();
    expect(redirectsTo(await proxy(request(`${base}/login`)))).toBeNull();
  });

  it("does not accept the http cookie name on https", async () => {
    expect(redirectsTo(await proxy(request(`${base}/projects`, { cookie: httpSession })))).toBe("/login");
  });
});

describe("proxy on http (local dev): the session cookie is authjs.session-token", () => {
  const base = "http://localhost:3000";

  it("lets a signed-in user in", async () => {
    expect(redirectsTo(await proxy(request(`${base}/projects`, { cookie: httpSession })))).toBeNull();
    expect(redirectsTo(await proxy(request(`${base}/login`, { cookie: httpSession })))).toBe("/projects");
  });

  it("does not accept the __Secure- cookie name on http", async () => {
    expect(redirectsTo(await proxy(request(`${base}/projects`, { cookie: httpsSession })))).toBe("/login");
  });

  it("treats a token signed with another secret as signed out", async () => {
    const forged = `${HTTP_COOKIE}=${await encode({ token: { id: "x" }, secret: "some-other-secret-value-0123456789", salt: HTTP_COOKIE })}`;
    expect(redirectsTo(await proxy(request(`${base}/projects`, { cookie: forged })))).toBe("/login");
  });
});
