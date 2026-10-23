import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  headers: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/db", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/User", () => ({ UserModel: { findById: mocks.findById } }));

import {
  buildPayload,
  deliverWebhook,
  eventLabel,
  hasPriorityChanged,
  issueUrl,
  resetWebhookWarnings,
  scheduleIssueWebhook,
  signBody,
  type IssueWebhookPayload,
} from "@/lib/webhook";

const payload: IssueWebhookPayload = {
  event: "issue.created",
  label: "Issue ใหม่",
  projectKey: "MJ",
  number: 12,
  title: "Login redirects to a blank page",
  priority: "high",
  previousPriority: null,
  assignee: "Ann",
  url: "https://app.example.com/projects/MJ/issues/12",
  sentAt: "2026-10-23T08:00:00.000Z",
};

function logger() {
  const lines: string[] = [];
  return { lines, error: (m: string) => lines.push("error: " + m), warn: (m: string) => lines.push("warn: " + m) };
}

describe("signBody", () => {
  it("is HMAC-SHA256 in hex with a sha256= prefix (RFC 4231, test case 2)", () => {
    expect(signBody("what do ya want for nothing?", "Jefe")).toBe(
      "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    );
  });
  it("changes with the body and with the secret", () => {
    expect(signBody("a", "k")).not.toBe(signBody("b", "k"));
    expect(signBody("a", "k")).not.toBe(signBody("a", "k2"));
  });
});

describe("labels", () => {
  it("a new issue is 'Issue ใหม่'; a change names both priorities in capitals", () => {
    expect(eventLabel("issue.created", null, "high")).toBe("Issue ใหม่");
    expect(eventLabel("issue.priority_changed", "medium", "low")).toBe("เปลี่ยน priority: MEDIUM → LOW");
    expect(eventLabel("issue.priority_changed", "low", "high")).toBe("เปลี่ยน priority: LOW → HIGH");
    expect(eventLabel("issue.priority_changed", null, "high")).toBe("เปลี่ยน priority: ? → HIGH");
  });
});

describe("hasPriorityChanged", () => {
  it("is true for every real change, in both directions", () => {
    for (const [from, to] of [["low", "medium"], ["medium", "low"], ["medium", "high"], ["high", "low"], ["low", "high"], ["high", "medium"]]) {
      expect(hasPriorityChanged(from, to)).toBe(true);
    }
  });
  it("is false when the priority is the same or not sent", () => {
    for (const p of ["low", "medium", "high"]) expect(hasPriorityChanged(p, p)).toBe(false);
    expect(hasPriorityChanged("medium", undefined)).toBe(false);
    expect(hasPriorityChanged("medium", null)).toBe(false);
  });
});

describe("payload", () => {
  it("builds the issue link without a double slash", () => {
    expect(issueUrl("https://a.example.com/", "MJ", 3)).toBe("https://a.example.com/projects/MJ/issues/3");
    expect(issueUrl("https://a.example.com///", "MJ", 3)).toBe("https://a.example.com/projects/MJ/issues/3");
  });

  it("carries the fields n8n needs", () => {
    const built = buildPayload({
      event: "issue.priority_changed",
      projectKey: "MJ",
      number: 7,
      title: "T",
      priority: "low",
      previousPriority: "medium",
      assignee: null,
      origin: "https://a.example.com",
      now: new Date("2026-10-23T08:00:00Z"),
    });
    expect(built).toEqual({
      event: "issue.priority_changed",
      label: "เปลี่ยน priority: MEDIUM → LOW",
      projectKey: "MJ",
      number: 7,
      title: "T",
      priority: "low",
      previousPriority: "medium",
      assignee: null,
      url: "https://a.example.com/projects/MJ/issues/7",
      sentAt: "2026-10-23T08:00:00.000Z",
    });
  });

  it("survives JSON.parse then JSON.stringify byte for byte (n8n re-signs the parsed body)", () => {
    const titles = [
      "แก้งานเรื่อง OCR",
      "🔥 urgent 🚨",
      'He said "hi"',
      "C:\\path\\to\\file",
      "line1\nline2\ttab",
      "</script><b>x</b>",
      "sep\u2028and\u2029",
      "ünïcödé — ‘quotes’",
    ];
    for (const title of titles) {
      const body = JSON.stringify({ ...payload, title });
      expect(JSON.stringify(JSON.parse(body))).toBe(body);
    }
  });
});

describe("deliverWebhook", () => {
  beforeEach(() => resetWebhookWarnings());

  it("does nothing, quietly, when there is no URL", async () => {
    const fetchFn = vi.fn();
    const log = logger();
    await deliverWebhook(payload, { url: undefined, secret: "s", fetchFn, log });
    await deliverWebhook(payload, { url: "", secret: "s", fetchFn, log });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log.lines).toEqual([]);
  });

  it("never sends unsigned: no secret means no request and a single warning", async () => {
    const fetchFn = vi.fn();
    const log = logger();
    await deliverWebhook(payload, { url: "https://n8n.example.com/webhook/abc", secret: undefined, fetchFn, log });
    await deliverWebhook(payload, { url: "https://n8n.example.com/webhook/abc", secret: "", fetchFn, log });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatch(/^warn: .*N8N_WEBHOOK_SECRET/);
  });

  it("POSTs the exact body that it signed, with the headers n8n needs", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await deliverWebhook(payload, { url: "https://n8n.example.com/webhook/abc", secret: "topsecret", fetchFn, log: logger() });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/webhook/abc");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(payload);
    // what the receiver does: recompute the HMAC over the received body
    const expected = "sha256=" + createHmac("sha256", "topsecret").update(init.body).digest("hex");
    expect(init.headers["X-Signature"]).toBe(expected);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe("manual");
  });

  it("logs a non-2xx answer as one line and does not throw", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const log = logger();
    await expect(deliverWebhook(payload, { url: "https://n8n.example.com/w/abc", secret: "s", fetchFn, log })).resolves.toBeUndefined();
    expect(log.lines).toEqual(["error: [n8n] webhook answered HTTP 502"]);
  });

  it("logs a network error as one line and does not throw", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const log = logger();
    await expect(deliverWebhook(payload, { url: "https://n8n.example.com/w/abc", secret: "s", fetchFn, log })).resolves.toBeUndefined();
    expect(log.lines).toEqual(["error: [n8n] webhook failed: TypeError: fetch failed"]);
  });

  it("keeps the URL, the secret and the body out of the log, even for a mistyped URL", async () => {
    const log = logger();
    const secret = "very-secret-value";
    const url = "n8n.example.com/webhook/path-token-123"; // no https:// -> real fetch throws and quotes it
    await deliverWebhook(payload, { url, secret, log });
    const text = log.lines.join("\n");
    expect(log.lines).toHaveLength(1);
    expect(text).toContain("webhook failed");
    expect(text).not.toContain("path-token-123");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(payload.title);

    const log2 = logger();
    const fetchFn = vi.fn().mockRejectedValue(new Error(`boom at https://n8n.example.com/webhook/path-token-456 with ${secret}`));
    await deliverWebhook(payload, { url: "https://n8n.example.com/webhook/path-token-456", secret, fetchFn, log: log2 });
    expect(log2.lines.join("\n")).not.toContain("path-token-456");
    expect(log2.lines.join("\n")).not.toContain(secret);
  });

  describe("against a server that never answers", () => {
    let server: http.Server;
    let url: string;
    beforeAll(async () => {
      server = http.createServer(() => {
        /* accept the request and say nothing */
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook/x`;
    });
    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });

    it("gives up after the timeout, logs one line, and resolves", async () => {
      const log = logger();
      const started = Date.now();
      await deliverWebhook(payload, { url, secret: "s", timeoutMs: 150, log });
      const took = Date.now() - started;
      expect(took).toBeGreaterThanOrEqual(100);
      expect(took).toBeLessThan(2000);
      expect(log.lines).toHaveLength(1);
      expect(log.lines[0]).toMatch(/^error: \[n8n\] webhook failed: (TimeoutError|AbortError)/);
    });
  });

  it("logs one line when nothing is listening", async () => {
    const log = logger();
    await deliverWebhook(payload, { url: "http://127.0.0.1:9/webhook/x", secret: "s", timeoutMs: 1000, log });
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatch(/^error: \[n8n\] webhook failed:/);
  });
});

describe("scheduleIssueWebhook", () => {
  const saved = { ...process.env };
  const scheduled: Array<() => Promise<void> | void> = [];
  const input = { event: "issue.created" as const, projectKey: "MJ", number: 12, title: "Hello", priority: "medium", assigneeId: null as string | null };

  beforeEach(() => {
    vi.clearAllMocks();
    resetWebhookWarnings();
    scheduled.length = 0;
    mocks.after.mockImplementation((cb: () => Promise<void> | void) => void scheduled.push(cb));
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    mocks.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ name: "Ann" }) }) });
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.APP_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  async function sent(extraEnv: Record<string, string> = {}, assigneeId: string | null = null) {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/abc";
    process.env.N8N_WEBHOOK_SECRET = "s3cret";
    Object.assign(process.env, extraEnv);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await scheduleIssueWebhook({ ...input, assigneeId });
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse(fetchMock.mock.calls[0][1].body) as IssueWebhookPayload;
  }

  it("does nothing at all when N8N_WEBHOOK_URL is unset (no after(), no header read, no log)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(scheduleIssueWebhook(input)).resolves.toBeUndefined();
    process.env.N8N_WEBHOOK_URL = "   ";
    await expect(scheduleIssueWebhook(input)).resolves.toBeUndefined();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("schedules the send with after() instead of awaiting it", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/abc";
    process.env.N8N_WEBHOOK_SECRET = "s";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await scheduleIssueWebhook(input);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing is sent until after() runs the callback
  });

  it("sends the payload with the assignee's name, and a link built from APP_URL", async () => {
    const body = await sent({ APP_URL: "https://mini-jira.example.com/" }, "507f1f77bcf86cd799439011");
    expect(body).toMatchObject({ event: "issue.created", label: "Issue ใหม่", previousPriority: null, projectKey: "MJ", number: 12, title: "Hello", priority: "medium", assignee: "Ann", url: "https://mini-jira.example.com/projects/MJ/issues/12" });
    expect(Number.isNaN(Date.parse(body.sentAt))).toBe(false);
  });

  it("sends assignee null for an unassigned issue and does not look anyone up", async () => {
    const body = await sent({ APP_URL: "https://a.example.com" }, null);
    expect(body.assignee).toBeNull();
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("still sends, without a name, when the assignee lookup fails", async () => {
    mocks.findById.mockImplementation(() => {
      throw new Error("db down");
    });
    const body = await sent({ APP_URL: "https://a.example.com" }, "507f1f77bcf86cd799439011");
    expect(body.assignee).toBeNull();
  });

  it("link origin: APP_URL first, then the production domain Vercel provides, then the request host", async () => {
    expect((await sent({ APP_URL: "https://custom.example.com" })).url).toBe("https://custom.example.com/projects/MJ/issues/12");
    scheduled.length = 0;
    delete process.env.APP_URL;
    expect((await sent({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "mini-jira-tan.vercel.app" })).url).toBe("https://mini-jira-tan.vercel.app/projects/MJ/issues/12");
    scheduled.length = 0;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect((await sent()).url).toBe("http://localhost:3000/projects/MJ/issues/12");
  });

  it("a spoofed x-forwarded-host cannot redirect the link when the production domain is known", async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: "evil.example.com", "x-forwarded-host": "evil.example.com", "x-forwarded-proto": "https" }));
    const body = await sent({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "mini-jira-tan.vercel.app" });
    expect(body.url.startsWith("https://mini-jira-tan.vercel.app/")).toBe(true);
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("uses the forwarded host and protocol only as the last resort", async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: "internal", "x-forwarded-host": "dev.example.com", "x-forwarded-proto": "https, http" }));
    expect((await sent()).url).toBe("https://dev.example.com/projects/MJ/issues/12");
  });

  it("never throws into the caller, even if after() does", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/abc";
    mocks.after.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(scheduleIssueWebhook(input)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
