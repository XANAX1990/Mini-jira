"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { accessError, authorizeAdmin } from "@/lib/permissions";
import { IssueModel } from "@/models/Issue";
import { ProjectModel, ROLES } from "@/models/Project";
import { UserModel } from "@/models/User";
import type { ActionResult } from "@/actions/projects";

const roleSchema = z.enum(ROLES);
const userIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid user");
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

const LAST_ADMIN = "A project needs at least one admin";

function refresh(projectKey: string) {
  revalidatePath(`/projects/${projectKey}`, "layout");
  revalidatePath("/projects");
}

/** Filter that only matches while some admin other than `userId` exists (the last-admin guard). */
function hasOtherAdmin(userId: Types.ObjectId) {
  return { members: { $elemMatch: { userId: { $ne: userId }, role: "admin" } } };
}

export async function addMember(
  projectKey: string,
  email: unknown,
  role: unknown
): Promise<ActionResult> {
  const access = await authorizeAdmin(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const parsedEmail = emailSchema.safeParse(email);
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedEmail.success) return { ok: false, error: parsedEmail.error.issues[0].message };
  if (!parsedRole.success) return { ok: false, error: "Invalid role" };

  await connectDB();
  const user = await UserModel.findOne({ email: parsedEmail.data }).select("_id").lean();
  if (!user) {
    return { ok: false, error: "No user with that email. Ask them to sign in to Mini Jira first" };
  }

  // The $ne condition makes a double add (or a race) a no-op instead of a duplicate member.
  const res = await ProjectModel.updateOne(
    { _id: project._id, "members.userId": { $ne: user._id } },
    { $push: { members: { userId: user._id, role: parsedRole.data } } }
  );
  if (res.matchedCount === 0) return { ok: false, error: "That user is already a member" };

  refresh(project.key);
  return { ok: true, data: undefined };
}

export async function changeRole(
  projectKey: string,
  userId: unknown,
  role: unknown
): Promise<ActionResult> {
  const access = await authorizeAdmin(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const parsedId = userIdSchema.safeParse(userId);
  const parsedRole = roleSchema.safeParse(role);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0].message };
  if (!parsedRole.success) return { ok: false, error: "Invalid role" };
  const uid = new Types.ObjectId(parsedId.data);

  const target = project.members.find((m) => m.userId.equals(uid));
  if (!target) return { ok: false, error: "Member not found" };
  if (target.role === parsedRole.data) return { ok: true, data: undefined };

  await connectDB();
  const demoting = parsedRole.data === "member";
  const res = await ProjectModel.updateOne(
    {
      _id: project._id,
      "members.userId": uid,
      // Re-checked inside the same atomic update, so two admins can't demote each other at once.
      ...(demoting ? hasOtherAdmin(uid) : {}),
    },
    { $set: { "members.$[m].role": parsedRole.data } },
    { arrayFilters: [{ "m.userId": uid }] }
  );
  if (res.matchedCount === 0) return { ok: false, error: demoting ? LAST_ADMIN : "Member not found" };

  refresh(project.key);
  return { ok: true, data: undefined };
}

export async function removeMember(projectKey: string, userId: unknown): Promise<ActionResult> {
  const access = await authorizeAdmin(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0].message };
  const uid = new Types.ObjectId(parsedId.data);

  const target = project.members.find((m) => m.userId.equals(uid));
  if (!target) return { ok: false, error: "Member not found" };

  await connectDB();
  const res = await ProjectModel.updateOne(
    {
      _id: project._id,
      "members.userId": uid,
      ...(target.role === "admin" ? hasOtherAdmin(uid) : {}),
    },
    { $pull: { members: { userId: uid } } }
  );
  if (res.matchedCount === 0) {
    return { ok: false, error: target.role === "admin" ? LAST_ADMIN : "Member not found" };
  }

  // Cards of a removed member become unassigned.
  await IssueModel.updateMany({ projectId: project._id, assigneeId: uid }, { $set: { assigneeId: null } });

  refresh(project.key);
  return { ok: true, data: undefined };
}
