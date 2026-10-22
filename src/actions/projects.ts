"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { accessError, authorizeAdmin } from "@/lib/permissions";
import { IssueModel } from "@/models/Issue";
import { ProjectModel } from "@/models/Project";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}$/, "Key must be 2–6 letters (A–Z)"),
});

export async function createProject(
  _prev: ActionResult<{ key: string }> | null,
  formData: FormData
): Promise<ActionResult<{ key: string }>> {
  const user = await requireUser();

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    key: formData.get("key"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, key } = parsed.data;

  await connectDB();
  const userId = new Types.ObjectId(user.id);
  try {
    // init() makes sure the unique index on `key` exists before we rely on it.
    await ProjectModel.init();
    await ProjectModel.create({
      name,
      key,
      ownerId: userId,
      members: [{ userId, role: "admin" }],
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, error: `The key ${key} is already taken` };
    }
    throw err;
  }

  revalidatePath("/projects");
  return { ok: true, data: { key } };
}

const renameSchema = createProjectSchema.shape.name;

export async function renameProject(projectKey: string, name: unknown): Promise<ActionResult> {
  const access = await authorizeAdmin(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const parsed = renameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await connectDB();
  await ProjectModel.updateOne({ _id: project._id }, { $set: { name: parsed.data } });

  revalidatePath(`/projects/${project.key}`, "layout");
  revalidatePath("/projects");
  return { ok: true, data: undefined };
}

/** Deletes the project and all its issues. The caller must type the project key to confirm. */
export async function deleteProject(projectKey: string, confirmKey: unknown): Promise<ActionResult> {
  const access = await authorizeAdmin(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  if (typeof confirmKey !== "string" || confirmKey.trim().toUpperCase() !== project.key) {
    return { ok: false, error: `Type ${project.key} to confirm` };
  }

  await connectDB();
  // Issues first: if the second step fails the project is still there and can be deleted again.
  await IssueModel.deleteMany({ projectId: project._id });
  await ProjectModel.deleteOne({ _id: project._id });

  revalidatePath("/projects");
  return { ok: true, data: undefined };
}
