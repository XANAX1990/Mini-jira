"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { authorizeAdmin, authorizeMember } from "@/lib/permissions";
import { orderAtEnd } from "@/lib/order";
import { IssueModel, PRIORITIES, STATUSES, TYPES } from "@/models/Issue";
import { ProjectModel, type Project } from "@/models/Project";
import type { ActionResult } from "@/actions/projects";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const fields = {
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  description: z.string().max(10000, "Description is too long"),
  type: z.enum(TYPES),
  priority: z.enum(PRIORITIES),
  assigneeId: objectId.nullable(),
  status: z.enum(STATUSES),
};

const createSchema = z
  .object({
    title: fields.title,
    description: fields.description.optional(),
    type: fields.type.optional(),
    priority: fields.priority.optional(),
    assigneeId: fields.assigneeId.optional(),
  })
  .strict();

const updateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");

const numberSchema = z.number().int().positive();

const ACCESS_ERRORS = {
  not_found: "Project not found",
  forbidden: "Only project admins can do this",
} as const;

function accessError(error: keyof typeof ACCESS_ERRORS) {
  return { ok: false as const, error: ACCESS_ERRORS[error] };
}

function isMember(project: Project, userId: string) {
  return project.members.some((m) => m.userId.toString() === userId);
}

function refresh(projectKey: string, number?: number) {
  revalidatePath(`/projects/${projectKey}`);
  if (number !== undefined) revalidatePath(`/projects/${projectKey}/issues/${number}`);
}

export async function createIssue(
  projectKey: string,
  input: unknown
): Promise<ActionResult<{ number: number }>> {
  const access = await authorizeMember(projectKey);
  if (!access.ok) return accessError(access.error);
  const { user, project } = access;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.assigneeId && !isMember(project, data.assigneeId)) {
    return { ok: false, error: "Assignee must be a member of the project" };
  }

  await connectDB();
  // Atomic counter: two simultaneous creates can never get the same number.
  const bumped = await ProjectModel.findOneAndUpdate(
    { _id: project._id },
    { $inc: { issueCounter: 1 } },
    { new: true }
  ).lean();
  if (!bumped) return accessError("not_found");

  await IssueModel.create({
    projectId: project._id,
    number: bumped.issueCounter,
    title: data.title,
    description: data.description ?? "",
    type: data.type ?? "task",
    priority: data.priority ?? "medium",
    assigneeId: data.assigneeId ? new Types.ObjectId(data.assigneeId) : null,
    reporterId: new Types.ObjectId(user.id),
    status: "todo",
    order: await orderAtEnd(project._id, "todo"),
  });

  refresh(project.key);
  return { ok: true, data: { number: bumped.issueCounter } };
}

export async function updateIssue(
  projectKey: string,
  number: number,
  patch: unknown
): Promise<ActionResult> {
  const access = await authorizeMember(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const num = numberSchema.safeParse(number);
  if (!num.success) return { ok: false, error: "Issue not found" };
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.assigneeId && !isMember(project, data.assigneeId)) {
    return { ok: false, error: "Assignee must be a member of the project" };
  }

  await connectDB();
  const issue = await IssueModel.findOne({ projectId: project._id, number: num.data });
  if (!issue) return { ok: false, error: "Issue not found" };

  if (data.title !== undefined) issue.title = data.title;
  if (data.description !== undefined) issue.description = data.description;
  if (data.type !== undefined) issue.type = data.type;
  if (data.priority !== undefined) issue.priority = data.priority;
  if (data.assigneeId !== undefined) {
    issue.assigneeId = data.assigneeId ? new Types.ObjectId(data.assigneeId) : null;
  }
  if (data.status !== undefined && data.status !== issue.status) {
    // Changing the column puts the card at the bottom of the new one.
    issue.status = data.status;
    issue.order = await orderAtEnd(project._id, data.status);
  }
  await issue.save();

  refresh(project.key, num.data);
  return { ok: true, data: undefined };
}

export async function deleteIssue(projectKey: string, number: number): Promise<ActionResult> {
  const access = await authorizeAdmin(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const num = numberSchema.safeParse(number);
  if (!num.success) return { ok: false, error: "Issue not found" };

  await connectDB();
  const res = await IssueModel.deleteOne({ projectId: project._id, number: num.data });
  if (res.deletedCount === 0) return { ok: false, error: "Issue not found" };

  refresh(project.key, num.data);
  return { ok: true, data: undefined };
}
