import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({
  authorizeAdmin: vi.fn(),
  projectUpdateOne: vi.fn(),
  issueUpdateMany: vi.fn(),
  userFindOne: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  authorizeAdmin: mocks.authorizeAdmin,
  accessError: (error: "not_found" | "forbidden") => ({
    ok: false as const,
    error: error === "forbidden" ? "Only project admins can do this" : "Project not found",
  }),
}));
vi.mock("@/models/Project", async () => ({
  ROLES: (await import("@/lib/roles")).ROLES,
  ProjectModel: { updateOne: mocks.projectUpdateOne },
}));
vi.mock("@/models/Issue", () => ({ IssueModel: { updateMany: mocks.issueUpdateMany } }));
vi.mock("@/models/User", () => ({
  UserModel: { findOne: () => ({ select: () => ({ lean: mocks.userFindOne }) }) },
}));

import { addMember, changeRole, removeMember } from "@/actions/members";

const ADMIN_A = new Types.ObjectId();
const ADMIN_B = new Types.ObjectId();
const MEMBER = new Types.ObjectId();
const project = {
  _id: new Types.ObjectId(),
  key: "MJ",
  members: [
    { userId: ADMIN_A, role: "admin" },
    { userId: ADMIN_B, role: "admin" },
    { userId: MEMBER, role: "member" },
  ],
};

const LAST_ADMIN = "A project needs at least one admin";

/** The condition the database re-checks inside the update itself. */
const otherAdminExists = (uid: Types.ObjectId) => ({
  members: { $elemMatch: { userId: { $ne: uid }, role: "admin" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizeAdmin.mockResolvedValue({ ok: true, project, role: "admin", user: { id: "x" } });
  mocks.projectUpdateOne.mockResolvedValue({ matchedCount: 1 });
});

describe("last-admin guard: changeRole", () => {
  it("demoting an admin only matches while another admin exists", async () => {
    const res = await changeRole("MJ", ADMIN_A.toString(), "member");
    expect(res.ok).toBe(true);
    const [filter] = mocks.projectUpdateOne.mock.calls[0];
    expect(filter).toMatchObject({ _id: project._id, ...otherAdminExists(ADMIN_A) });
  });

  it("is rejected when the database says no other admin is left", async () => {
    mocks.projectUpdateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await changeRole("MJ", ADMIN_A.toString(), "member")).toEqual({ ok: false, error: LAST_ADMIN });
  });

  it("promoting a member needs no guard", async () => {
    const res = await changeRole("MJ", MEMBER.toString(), "admin");
    expect(res.ok).toBe(true);
    expect(mocks.projectUpdateOne.mock.calls[0][0]).not.toHaveProperty("members");
  });

  it("does nothing when the role is already the requested one", async () => {
    expect((await changeRole("MJ", ADMIN_A.toString(), "admin")).ok).toBe(true);
    expect(mocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects someone who is not a member, a bad id and a bad role", async () => {
    expect(await changeRole("MJ", new Types.ObjectId().toString(), "admin")).toEqual({
      ok: false,
      error: "Member not found",
    });
    expect((await changeRole("MJ", "nope", "admin")).ok).toBe(false);
    expect(await changeRole("MJ", MEMBER.toString(), "owner")).toEqual({ ok: false, error: "Invalid role" });
    expect(mocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("refuses non-admins before touching the database", async () => {
    mocks.authorizeAdmin.mockResolvedValue({ ok: false, error: "forbidden" });
    expect(await changeRole("MJ", MEMBER.toString(), "admin")).toEqual({
      ok: false,
      error: "Only project admins can do this",
    });
    expect(mocks.projectUpdateOne).not.toHaveBeenCalled();
  });
});

describe("last-admin guard: removeMember", () => {
  it("removing an admin only matches while another admin exists", async () => {
    const res = await removeMember("MJ", ADMIN_B.toString());
    expect(res.ok).toBe(true);
    const [filter, update] = mocks.projectUpdateOne.mock.calls[0];
    expect(filter).toMatchObject(otherAdminExists(ADMIN_B));
    expect(update).toEqual({ $pull: { members: { userId: ADMIN_B } } });
  });

  it("is rejected for the last admin, and nobody is unassigned", async () => {
    mocks.projectUpdateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await removeMember("MJ", ADMIN_A.toString())).toEqual({ ok: false, error: LAST_ADMIN });
    expect(mocks.issueUpdateMany).not.toHaveBeenCalled();
  });

  it("removing a plain member needs no guard and unassigns their issues in this project", async () => {
    const res = await removeMember("MJ", MEMBER.toString());
    expect(res.ok).toBe(true);
    expect(mocks.projectUpdateOne.mock.calls[0][0]).not.toHaveProperty("members");
    expect(mocks.issueUpdateMany).toHaveBeenCalledWith(
      { projectId: project._id, assigneeId: MEMBER },
      { $set: { assigneeId: null } }
    );
  });

  it("reports an unknown member", async () => {
    expect(await removeMember("MJ", new Types.ObjectId().toString())).toEqual({
      ok: false,
      error: "Member not found",
    });
  });
});

describe("addMember", () => {
  it("tells the admin to ask the person to sign in first when the email is unknown", async () => {
    mocks.userFindOne.mockResolvedValue(null);
    const res = await addMember("MJ", "nobody@x.io", "member");
    expect(res).toEqual({
      ok: false,
      error: "No user with that email. Ask them to sign in to Mini Jira first",
    });
    expect(mocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it("adds an existing user with the chosen role, ignoring case and spaces in the email", async () => {
    const uid = new Types.ObjectId();
    mocks.userFindOne.mockResolvedValue({ _id: uid });
    expect((await addMember("MJ", "  Bee@X.IO ", "admin")).ok).toBe(true);
    const [filter, update] = mocks.projectUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: project._id, "members.userId": { $ne: uid } });
    expect(update).toEqual({ $push: { members: { userId: uid, role: "admin" } } });
  });

  it("does not add the same user twice", async () => {
    mocks.userFindOne.mockResolvedValue({ _id: MEMBER });
    mocks.projectUpdateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await addMember("MJ", "bee@x.io", "member")).toEqual({
      ok: false,
      error: "That user is already a member",
    });
  });

  it("validates the email and the role", async () => {
    expect((await addMember("MJ", "not-an-email", "member")).ok).toBe(false);
    expect(await addMember("MJ", "bee@x.io", "owner")).toEqual({ ok: false, error: "Invalid role" });
  });
});
