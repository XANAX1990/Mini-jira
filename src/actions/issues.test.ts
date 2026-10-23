import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({
  authorizeMember: vi.fn(),
  findOneAndUpdate: vi.fn(),
  issueCreate: vi.fn(),
  issueFindOne: vi.fn(),
  userFindById: vi.fn(),
  after: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/db", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  authorizeMember: mocks.authorizeMember,
  authorizeAdmin: vi.fn(),
  accessError: () => ({ ok: false as const, error: "Project not found" }),
}));
vi.mock("@/lib/order", () => ({
  orderAtEnd: vi.fn().mockResolvedValue(1000),
  orderBetween: vi.fn(),
  needsRebalance: vi.fn(),
  rebalanceColumn: vi.fn(),
}));
vi.mock("@/models/Issue", async () => ({
  ...(await import("@/lib/issue-constants")),
  IssueModel: { create: mocks.issueCreate, findOne: mocks.issueFindOne },
}));
vi.mock("@/models/Project", () => ({ ProjectModel: { findOneAndUpdate: mocks.findOneAndUpdate } }));
vi.mock("@/models/User", () => ({ UserModel: { findById: mocks.userFindById } }));

import { createIssue, updateIssue } from "@/actions/issues";

const USER = new Types.ObjectId();
const ASSIGNEE = new Types.ObjectId();
const project = {
  _id: new Types.ObjectId(),
  key: "MJ",
  members: [
    { userId: USER, role: "admin" },
    { userId: ASSIGNEE, role: "member" },
  ],
};

const scheduled: Array<() => Promise<void> | void> = [];
let fetchMock: ReturnType<typeof vi.fn>;
const saved = { ...process.env };

/** Runs what was handed to after(), like Next does once the action has answered. */
async function flushAfter() {
  while (scheduled.length) await scheduled.shift()!();
}
const sentBodies = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));

function existingIssue(overrides: Record<string, unknown> = {}) {
  return {
    title: "Old title",
    description: "",
    type: "task",
    priority: "medium",
    status: "todo",
    assigneeId: null as Types.ObjectId | null,
    order: 1000,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduled.length = 0;
  process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/abc";
  process.env.N8N_WEBHOOK_SECRET = "s3cret";
  process.env.APP_URL = "https://app.example.com";
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  mocks.after.mockImplementation((cb: () => Promise<void> | void) => void scheduled.push(cb));
  mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
  mocks.authorizeMember.mockResolvedValue({ ok: true, user: { id: USER.toString() }, project, role: "admin" });
  mocks.findOneAndUpdate.mockReturnValue({ lean: async () => ({ issueCounter: 12 }) });
  mocks.issueCreate.mockResolvedValue({});
  mocks.userFindById.mockReturnValue({ select: () => ({ lean: async () => ({ name: "Ann" }) }) });
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe("createIssue and the n8n webhook", () => {
  it("answers first; the webhook is only sent when after() runs, and it carries the new issue", async () => {
    const res = await createIssue("MJ", { title: "Printer on fire", priority: "high" });
    expect(res).toEqual({ ok: true, data: { number: 12 } });
    expect(fetchMock).not.toHaveBeenCalled(); // nothing waited for the network
    expect(scheduled).toHaveLength(1);

    await flushAfter();
    expect(sentBodies()).toHaveLength(1);
    expect(sentBodies()[0]).toMatchObject({
      event: "issue.created",
      label: "Issue ใหม่",
      previousPriority: null,
      projectKey: "MJ",
      number: 12,
      title: "Printer on fire",
      priority: "high",
      assignee: null,
      url: "https://app.example.com/projects/MJ/issues/12",
    });
  });

  it("includes the assignee's name and a high priority; still just one message", async () => {
    await createIssue("MJ", { title: "Urgent", priority: "high", assigneeId: ASSIGNEE.toString() });
    await flushAfter();
    expect(sentBodies()).toHaveLength(1);
    expect(sentBodies()[0]).toMatchObject({ event: "issue.created", priority: "high", assignee: "Ann" });
  });

  it("every new issue is announced, whatever its priority (the default is medium)", async () => {
    for (const input of [{ title: "Default" }, { title: "Medium", priority: "medium" }, { title: "Low", priority: "low" }]) {
      expect((await createIssue("MJ", input)).ok).toBe(true);
    }
    await flushAfter();
    expect(sentBodies().map((b) => [b.event, b.priority, b.label])).toEqual([
      ["issue.created", "medium", "Issue ใหม่"],
      ["issue.created", "medium", "Issue ใหม่"],
      ["issue.created", "low", "Issue ใหม่"],
    ]);
  });

  it("sends nothing and schedules nothing when the webhook is not configured", async () => {
    delete process.env.N8N_WEBHOOK_URL;
    const res = await createIssue("MJ", { title: "Quiet", priority: "high" });
    expect(res.ok).toBe(true);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not notify for a rejected request", async () => {
    expect((await createIssue("MJ", { title: "   ", priority: "high" })).ok).toBe(false);
    expect((await createIssue("MJ", { title: "x", priority: "high", assigneeId: new Types.ObjectId().toString() })).ok).toBe(false);
    mocks.authorizeMember.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await createIssue("MJ", { title: "x", priority: "high" })).ok).toBe(false);
    expect(scheduled).toHaveLength(0);
  });

  it("a dead or slow webhook cannot fail the action, and only logs one line afterwards", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5678"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await createIssue("MJ", { title: "Still created", priority: "high" });
    expect(res).toEqual({ ok: true, data: { number: 12 } }); // the action is already done...
    expect(spy).not.toHaveBeenCalled();
    await expect(flushAfter()).resolves.toBeUndefined(); // ...and the failed send does not throw
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).not.toContain("s3cret");
    spy.mockRestore();
  });

  it("even if after() itself fails, the issue is created and the action succeeds", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("outside a request scope");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await createIssue("MJ", { title: "Created anyway", priority: "high" })).toEqual({ ok: true, data: { number: 12 } });
    expect(mocks.issueCreate).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("updateIssue and the n8n webhook", () => {
  async function update(patch: Record<string, unknown>, issue = existingIssue()) {
    mocks.issueFindOne.mockResolvedValue(issue);
    const res = await updateIssue("MJ", 7, patch);
    await flushAfter();
    return { res, issue };
  }

  it("sends one message for any priority change, with the old and the new priority", async () => {
    const cases: Array<[string, string, string]> = [
      ["medium", "high", "เปลี่ยน priority: MEDIUM → HIGH"],
      ["medium", "low", "เปลี่ยน priority: MEDIUM → LOW"],
      ["low", "medium", "เปลี่ยน priority: LOW → MEDIUM"],
      ["high", "low", "เปลี่ยน priority: HIGH → LOW"],
    ];
    for (const [from, to, label] of cases) {
      fetchMock.mockClear();
      const { res } = await update({ priority: to }, existingIssue({ priority: from }));
      expect(res.ok).toBe(true);
      expect(sentBodies()).toHaveLength(1);
      expect(sentBodies()[0]).toMatchObject({ event: "issue.priority_changed", label, projectKey: "MJ", number: 7, title: "Old title", priority: to, previousPriority: from, assignee: null, url: "https://app.example.com/projects/MJ/issues/7" });
    }
  });

  it("uses the title and assignee as they are after this edit", async () => {
    await update({ priority: "high", title: "New title", assigneeId: ASSIGNEE.toString() });
    expect(sentBodies()[0]).toMatchObject({ title: "New title", assignee: "Ann" });
  });

  it("sends nothing when the priority is unchanged (the edit form resends every field)", async () => {
    await update({ title: "Renamed", priority: "high", status: "todo" }, existingIssue({ priority: "high" }));
    await update({ priority: "medium" }); // existingIssue() is medium
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
  });

  it("sends nothing for edits that leave the priority alone", async () => {
    await update({ title: "Just a rename" });
    await update({ status: "done" });
    await update({ assigneeId: ASSIGNEE.toString(), description: "text", type: "bug" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an edit that is refused", async () => {
    mocks.issueFindOne.mockResolvedValue(null);
    expect((await updateIssue("MJ", 99, { priority: "high" })).ok).toBe(false);
    expect((await updateIssue("MJ", 7, { priority: "urgent" })).ok).toBe(false);
    expect((await updateIssue("MJ", 7, { priority: "high", assigneeId: new Types.ObjectId().toString() })).ok).toBe(false);
    expect(scheduled).toHaveLength(0);
  });

  it("saves first: the change is stored before anything is scheduled", async () => {
    const issue = existingIssue();
    const order: string[] = [];
    issue.save.mockImplementation(async () => void order.push("save"));
    mocks.after.mockImplementation(() => void order.push("schedule"));
    mocks.issueFindOne.mockResolvedValue(issue);
    await updateIssue("MJ", 7, { priority: "high" });
    expect(order).toEqual(["save", "schedule"]);
  });

  it("a failing webhook does not fail the edit", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res } = await update({ priority: "high" });
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("HTTP 500");
    spy.mockRestore();
  });
});
