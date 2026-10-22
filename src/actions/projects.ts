"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
