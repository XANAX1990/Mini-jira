import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ProjectModel, type Role } from "@/models/Project";

export async function getMembership(projectKey: string, userId: string) {
  if (!Types.ObjectId.isValid(userId)) return null;
  await connectDB();
  const project = await ProjectModel.findOne({
    key: projectKey.toUpperCase(),
    "members.userId": new Types.ObjectId(userId),
  }).lean();
  if (!project) return null;
  const role = project.members.find((m) => m.userId.toString() === userId)?.role ?? "member";
  return { project, role: role as Role };
}

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
