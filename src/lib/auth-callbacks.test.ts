import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({ findOneAndUpdate: vi.fn() }));

vi.mock("@/lib/db", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/User", () => ({ UserModel: { findOneAndUpdate: mocks.findOneAndUpdate } }));

import { isSignInAllowed, upsertUser } from "@/lib/auth-callbacks";

describe("isSignInAllowed", () => {
  it("refuses any account without an email", () => {
    expect(isSignInAllowed({ user: {}, account: { provider: "github" } })).toBe(false);
    expect(isSignInAllowed({ user: { email: null }, account: { provider: "github" } })).toBe(false);
    expect(
      isSignInAllowed({ user: { email: "" }, account: { provider: "google" }, profile: { email_verified: true } })
    ).toBe(false);
  });

  it("lets a GitHub account with an email in", () => {
    expect(isSignInAllowed({ user: { email: "a@x.io" }, account: { provider: "github" }, profile: {} })).toBe(true);
  });

  it("lets a Google account in only when email_verified is exactly true", () => {
    const google = { provider: "google" };
    const user = { email: "a@x.io" };
    expect(isSignInAllowed({ user, account: google, profile: { email_verified: true } })).toBe(true);
    expect(isSignInAllowed({ user, account: google, profile: { email_verified: false } })).toBe(false);
    expect(isSignInAllowed({ user, account: google, profile: {} })).toBe(false);
    expect(isSignInAllowed({ user, account: google, profile: null })).toBe(false);
    expect(isSignInAllowed({ user, account: google })).toBe(false);
    // not a boolean: do not guess
    expect(isSignInAllowed({ user, account: google, profile: { email_verified: "true" } })).toBe(false);
    expect(isSignInAllowed({ user, account: google, profile: { email_verified: 1 } })).toBe(false);
  });

  it("does not apply the Google rule to other providers", () => {
    expect(
      isSignInAllowed({ user: { email: "a@x.io" }, account: { provider: "github" }, profile: { email_verified: false } })
    ).toBe(true);
  });
});

describe("upsertUser", () => {
  const id = new Types.ObjectId();
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOneAndUpdate.mockResolvedValue({ _id: id });
  });

  it("upserts by lower-cased, trimmed email and returns the _id as a string", async () => {
    const result = await upsertUser({ name: "Ann", email: "  Ann@Example.COM ", image: "https://img/a.png" });
    expect(result).toBe(id.toString());
    const [filter, update, options] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ email: "ann@example.com" });
    expect(update).toEqual({
      $set: { name: "Ann", image: "https://img/a.png" },
      $setOnInsert: { email: "ann@example.com" },
    });
    expect(options).toEqual({ upsert: true, returnDocument: "after" });
  });

  it("GitHub and Google with the same email (any casing) look up the same document", async () => {
    await upsertUser({ name: "Ann (GitHub)", email: "Ann@Example.com", image: "https://github/a.png" });
    await upsertUser({ name: "Ann Smith", email: "ann@example.COM", image: "https://google/a.png" });
    const [first, second] = mocks.findOneAndUpdate.mock.calls.map((c) => c[0]);
    expect(first).toEqual(second);
  });

  it("falls back to the email when there is no name", async () => {
    await upsertUser({ name: "   ", email: "x@y.io" });
    expect(mocks.findOneAndUpdate.mock.calls[0][1].$set.name).toBe("x@y.io");
    await upsertUser({ name: null, email: "x@y.io" });
    expect(mocks.findOneAndUpdate.mock.calls[1][1].$set.name).toBe("x@y.io");
  });

  it("does not overwrite the avatar when the provider has none", async () => {
    await upsertUser({ name: "A", email: "x@y.io", image: null });
    await upsertUser({ name: "A", email: "x@y.io" });
    for (const call of mocks.findOneAndUpdate.mock.calls) expect(call[1].$set).not.toHaveProperty("image");
  });

  it("retries once when two first sign-ins race on the unique email index", async () => {
    mocks.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000 }));
    expect(await upsertUser({ name: "A", email: "x@y.io" })).toBe(id.toString());
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors, and gives up after one retry", async () => {
    mocks.findOneAndUpdate.mockRejectedValueOnce(new Error("network down"));
    await expect(upsertUser({ name: "A", email: "x@y.io" })).rejects.toThrow("network down");
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const dup = () => Object.assign(new Error("E11000"), { code: 11000 });
    mocks.findOneAndUpdate.mockRejectedValueOnce(dup()).mockRejectedValueOnce(dup());
    await expect(upsertUser({ name: "A", email: "x@y.io" })).rejects.toThrow("E11000");
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("throws if the database returns no document", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    await expect(upsertUser({ name: "A", email: "x@y.io" })).rejects.toThrow("Could not create or find the user");
  });
});
