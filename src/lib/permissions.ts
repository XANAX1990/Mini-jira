import { cache } from "react";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ProjectModel, type Role } from "@/models/Project";

// cache(): layout and page both ask for the membership in one request.
export const getMembership = cache(async (projectKey: string, userId: string) => {
  if (!Types.ObjectId.isValid(userId)) return null;
  await connectDB();
  const project = await ProjectModel.findOne({
    key: projectKey.toUpperCase(),
    "members.userId": new Types.ObjectId(userId),
  }).lean();
  if (!project) return null;
  const role = project.members.find((m) => m.userId.toString() === userId)?.role ?? "member";
  return { project, role: role as Role };
});

/** Signed-in member of the project, or 404 (never reveals that the project exists). */
export async function requireMember(projectKey: string) {
  const user = await requireUser();
  const membership = await getMembership(projectKey, user.id);
  if (!membership) notFound();
  return { user, ...membership };
}

/** Like requireMember, plus `{ ok: false, error: "forbidden" }` when the role isn't admin. */
export async function requireAdmin(projectKey: string) {
  const ctx = await requireMember(projectKey);
  if (ctx.role !== "admin") return { ok: false as const, error: "forbidden" as const };
  return { ok: true as const, ...ctx };
}

/** Non-throwing variants for Server Actions: expected failures come back as results. */
export async function authorizeMember(projectKey: string) {
  const user = await requireUser();
  const membership = await getMembership(projectKey, user.id);
  if (!membership) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const, user, ...membership };
}

export async function authorizeAdmin(projectKey: string) {
  const ctx = await authorizeMember(projectKey);
  if (!ctx.ok) return ctx;
  if (ctx.role !== "admin") return { ok: false as const, error: "forbidden" as const };
  return ctx;
}

const ACCESS_ERRORS = {
  not_found: "Project not found",
  forbidden: "Only project admins can do this",
} as const;

/** Failed authorizeMember/authorizeAdmin -> the ActionResult error the client sees. */
export function accessError(error: keyof typeof ACCESS_ERRORS) {
  return { ok: false as const, error: ACCESS_ERRORS[error] };
}
