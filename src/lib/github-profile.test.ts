import { describe, expect, it, vi } from "vitest";
import { fetchGitHubProfile, pickVerifiedEmail } from "@/lib/github-profile";

describe("pickVerifiedEmail", () => {
  it("takes the primary email when it is verified", () => {
    expect(
      pickVerifiedEmail([
        { email: "other@x.io", primary: false, verified: true },
        { email: "main@x.io", primary: true, verified: true },
      ])
    ).toBe("main@x.io");
  });

  it("picks the primary one wherever it sits in the list", () => {
    const list = [
      { email: "a@x.io", primary: false, verified: true },
      { email: "main@x.io", primary: true, verified: true },
      { email: "c@x.io", primary: false, verified: true },
    ];
    expect(pickVerifiedEmail(list)).toBe("main@x.io");
    expect(pickVerifiedEmail([list[1], list[0], list[2]])).toBe("main@x.io");
    expect(pickVerifiedEmail([list[0], list[2], list[1]])).toBe("main@x.io");
  });

  it("never takes an unverified address, even the primary one", () => {
    expect(pickVerifiedEmail([{ email: "victim@x.io", primary: true, verified: false }])).toBeUndefined();
    expect(pickVerifiedEmail([{ email: "victim@x.io", verified: false }, { email: "b@x.io", primary: false }])).toBeUndefined();
  });

  it("falls back to the first verified address when the primary is not verified", () => {
    expect(
      pickVerifiedEmail([
        { email: "victim@x.io", primary: true, verified: false },
        { email: "mine@x.io", primary: false, verified: true },
      ])
    ).toBe("mine@x.io");
  });

  it("is strict about `verified`: only the boolean true counts", () => {
    expect(pickVerifiedEmail([{ email: "a@x.io", primary: true, verified: "true" }])).toBeUndefined();
    expect(pickVerifiedEmail([{ email: "a@x.io", primary: true, verified: 1 }])).toBeUndefined();
    expect(pickVerifiedEmail([{ email: "a@x.io", primary: true }])).toBeUndefined();
  });

  it("copes with junk instead of throwing", () => {
    expect(pickVerifiedEmail(undefined)).toBeUndefined();
    expect(pickVerifiedEmail(null)).toBeUndefined();
    expect(pickVerifiedEmail({ message: "Bad credentials" })).toBeUndefined();
    expect(pickVerifiedEmail([null, 5, {}, { email: "", verified: true }, { email: 7, verified: true }])).toBeUndefined();
    expect(pickVerifiedEmail([])).toBeUndefined();
  });
});

describe("fetchGitHubProfile", () => {
  const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
  const user = { id: 1, login: "ann", name: "Ann", avatar_url: "https://a/x.png" };

  it("keeps the public email and does not ask for the email list (same as before)", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(json({ ...user, email: "public@x.io" }));
    const profile = await fetchGitHubProfile("tok", fetchFn as unknown as typeof fetch);
    expect(profile.email).toBe("public@x.io");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.github.com/user");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("without a public email uses the primary verified one from /user/emails", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ ...user, email: null }))
      .mockResolvedValueOnce(
        json([
          { email: "second@x.io", primary: false, verified: true },
          { email: "main@x.io", primary: true, verified: true },
        ])
      );
    const profile = await fetchGitHubProfile("tok", fetchFn as unknown as typeof fetch);
    expect(profile.email).toBe("main@x.io");
    expect(fetchFn.mock.calls[1][0]).toBe("https://api.github.com/user/emails");
    expect(profile.login).toBe("ann"); // the rest of the profile is untouched
  });

  it("leaves the email empty when GitHub has no verified address, so the sign-in is refused", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ ...user, email: null }))
      .mockResolvedValueOnce(json([{ email: "victim@x.io", primary: true, verified: false }]));
    const profile = await fetchGitHubProfile("tok", fetchFn as unknown as typeof fetch);
    expect(profile.email).toBeUndefined();
  });

  it("leaves the email empty when the email list cannot be read", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ ...user, email: null }))
      .mockResolvedValueOnce(json({ message: "Forbidden" }, false));
    const profile = await fetchGitHubProfile("tok", fetchFn as unknown as typeof fetch);
    expect(profile.email).toBeFalsy();
  });
});
