import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  requireUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/db", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/models/Project", () => ({ ProjectModel: { findOne: mocks.findOne } }));

import {
  accessError,
  authorizeAdmin,
  authorizeMember,
  getMembership,
  requireAdmin,
  requireMember,
} from "@/lib/permissions";

const ADMIN = new Types.ObjectId();
const MEMBER = new Types.ObjectId();
const OUTSIDER = new Types.ObjectId();

const project = {
  _id: new Types.ObjectId(),
  key: "MJ",
  name: "Mini Jira",
  members: [
    { userId: ADMIN, role: "admin" },
    { userId: MEMBER, role: "member" },
  ],
};

function signInAs(id: Types.ObjectId) {
  mocks.requireUser.mockResolvedValue({ id: id.toString(), name: "T", email: "t@t.io", image: null });
  // The query only matches projects the user belongs to, like the real one.
  mocks.findOne.mockImplementation((filter: Record<string, Types.ObjectId>) => ({
    lean: () =>
      Promise.resolve(
        project.members.some((m) => m.userId.equals(filter["members.userId"])) ? project : null
      ),
  }));
}

beforeEach(() => vi.clearAllMocks());

describe("getMembership", () => {
  it("returns the project and the role of an admin", async () => {
    signInAs(ADMIN);
    expect(await getMembership("MJ", ADMIN.toString())).toEqual({ project, role: "admin" });
  });

  it("returns the role of a plain member", async () => {
    signInAs(MEMBER);
    expect((await getMembership("MJ", MEMBER.toString()))?.role).toBe("member");
  });

  it("returns null for someone who is not in the project", async () => {
    signInAs(OUTSIDER);
    expect(await getMembership("MJ", OUTSIDER.toString())).toBeNull();
  });

  it("looks the project up by upper-cased key and member id", async () => {
    signInAs(ADMIN);
    await getMembership("mj", ADMIN.toString());
    expect(mocks.findOne).toHaveBeenCalledWith({ key: "MJ", "members.userId": ADMIN });
  });

  it("returns null without querying when the user id is not an ObjectId", async () => {
    expect(await getMembership("MJ", "not-an-id")).toBeNull();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});

describe("requireMember", () => {
  it("returns the user, project and role for a member", async () => {
    signInAs(MEMBER);
    const ctx = await requireMember("MJ");
    expect(ctx.role).toBe("member");
    expect(ctx.project).toBe(project);
    expect(ctx.user.id).toBe(MEMBER.toString());
  });

  it("answers 404 for a non-member, same as a project that does not exist", async () => {
    signInAs(OUTSIDER);
    await expect(requireMember("MJ")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});

describe("requireAdmin", () => {
  it("lets an admin through", async () => {
    signInAs(ADMIN);
    const res = await requireAdmin("MJ");
    expect(res.ok).toBe(true);
  });

  it("returns forbidden for a plain member", async () => {
    signInAs(MEMBER);
    expect(await requireAdmin("MJ")).toEqual({ ok: false, error: "forbidden" });
  });

  it("answers 404 for a non-member instead of revealing the project", async () => {
    signInAs(OUTSIDER);
    await expect(requireAdmin("MJ")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("authorizeMember / authorizeAdmin (for Server Actions, never throw)", () => {
  it("authorizeMember: member ok, outsider not_found", async () => {
    signInAs(MEMBER);
    expect((await authorizeMember("MJ")).ok).toBe(true);
    signInAs(OUTSIDER);
    expect(await authorizeMember("MJ")).toEqual({ ok: false, error: "not_found" });
  });

  it("authorizeAdmin: admin ok, member forbidden, outsider not_found", async () => {
    signInAs(ADMIN);
    expect((await authorizeAdmin("MJ")).ok).toBe(true);
    signInAs(MEMBER);
    expect(await authorizeAdmin("MJ")).toEqual({ ok: false, error: "forbidden" });
    signInAs(OUTSIDER);
    expect(await authorizeAdmin("MJ")).toEqual({ ok: false, error: "not_found" });
  });

  it("accessError turns a failure into the message the client sees", () => {
    expect(accessError("forbidden")).toEqual({ ok: false, error: "Only project admins can do this" });
    expect(accessError("not_found")).toEqual({ ok: false, error: "Project not found" });
  });
});

describe("project key from the client is checked before it is used", () => {
  // What a hand-made Server Action call could send instead of a string.
  const hostile = [
    { $ne: "" },
    { $gt: "" },
    { $regex: ".*" },
    ["MJ"],
    12,
    true,
    null,
    undefined,
    {},
  ] as unknown as string[];

  it.each(hostile)("getMembership(%j) is null and never reaches the database", async (key) => {
    signInAs(ADMIN);
    expect(await getMembership(key, ADMIN.toString())).toBeNull();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it.each(["", "M", "ABCDEFG", "M1", "MJ1", "M-J", "M J", " MJ", "MJ ", "MJ\n", "M$", "M.", "ÅB", "มจ"])(
    "getMembership(%j) is null: keys are 2-6 letters",
    async (key) => {
      signInAs(ADMIN);
      expect(await getMembership(key, ADMIN.toString())).toBeNull();
      expect(mocks.findOne).not.toHaveBeenCalled();
    }
  );

  it.each(["MJ", "mj", "Mj", "ABCDEF", "abcdef"])("%s is still accepted", async (key) => {
    signInAs(ADMIN);
    await getMembership(key, ADMIN.toString());
    expect(mocks.findOne).toHaveBeenCalledWith({ key: key.toUpperCase(), "members.userId": ADMIN });
  });

  it("a Server Action with a bad key answers a clean 'Project not found', not a server error", async () => {
    signInAs(ADMIN);
    const bad = { $ne: "" } as unknown as string;
    expect(await authorizeMember(bad)).toEqual({ ok: false, error: "not_found" });
    expect(await authorizeAdmin(bad)).toEqual({ ok: false, error: "not_found" });
  });

  it("a page with a bad key is a 404", async () => {
    signInAs(ADMIN);
    await expect(requireMember("%7B%24ne%7D")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requireAdmin("not a key")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("the user must still be signed in first (a bad key does not skip authentication)", async () => {
    signInAs(ADMIN);
    await authorizeMember("!!");
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
  });
});
