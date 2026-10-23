"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { accessError, authorizeAdmin, authorizeMember } from "@/lib/permissions";
import { needsRebalance, orderAtEnd, orderBetween, rebalanceColumn } from "@/lib/order";
import { IssueModel, PRIORITIES, STATUSES, TYPES } from "@/models/Issue";
import { ProjectModel, type Project } from "@/models/Project";
import { isPriorityRaisedToHigh, scheduleIssueWebhook, shouldNotifyOnCreate } from "@/lib/webhook";
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
    { returnDocument: "after" }
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

  const priority = data.priority ?? "medium";
  if (shouldNotifyOnCreate(priority)) {
    await scheduleIssueWebhook({
      event: "issue.created",
      projectKey: project.key,
      number: bumped.issueCounter,
      title: data.title,
      priority,
      assigneeId: data.assigneeId ?? null,
    });
  }

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

  const previousPriority = issue.priority; // the edit form sends every field, so compare before changing
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

  if (isPriorityRaisedToHigh(previousPriority, data.priority)) {
    await scheduleIssueWebhook({
      event: "issue.priority_high",
      projectKey: project.key,
      number: num.data,
      title: issue.title,
      priority: "high",
      assigneeId: issue.assigneeId ? issue.assigneeId.toString() : null,
    });
  }

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

const moveSchema = z
  .object({
    status: z.enum(STATUSES),
    beforeNumber: numberSchema.optional(),
    afterNumber: numberSchema.optional(),
  })
  .strict();

const STALE_BOARD = "The board changed, please try again";

/**
 * Drop a card between two neighbours (by issue number). The new `order` is computed
 * here from the neighbours' current values; the client never sends one.
 */
export async function moveIssue(
  projectKey: string,
  number: number,
  target: unknown
): Promise<ActionResult> {
  const access = await authorizeMember(projectKey);
  if (!access.ok) return accessError(access.error);
  const { project } = access;

  const num = numberSchema.safeParse(number);
  const parsed = moveSchema.safeParse(target);
  if (!num.success || !parsed.success) return { ok: false, error: "Invalid move" };
  const { status, beforeNumber, afterNumber } = parsed.data;

  await connectDB();
  const issue = await IssueModel.findOne({ projectId: project._id, number: num.data })
    .select("_id")
    .lean();
  if (!issue) return { ok: false, error: "Issue not found" };

  // Neighbours must be other cards of this project in the target column.
  const column = { projectId: project._id, status, _id: { $ne: issue._id } };
  const find = (extra: Record<string, unknown>) =>
    IssueModel.findOne({ ...column, ...extra }).select("number order");

  let before = beforeNumber === undefined ? null : await find({ number: beforeNumber }).lean();
  let after = afterNumber === undefined ? null : await find({ number: afterNumber }).lean();
  if ((beforeNumber !== undefined && !before) || (afterNumber !== undefined && !after)) {
    return { ok: false, error: STALE_BOARD };
  }
  if (before && after && before.order >= after.order) return { ok: false, error: STALE_BOARD };
  // With one neighbour only, use the real card on the other side instead of trusting the client.
  if (before && !after) after = await find({ order: { $gt: before.order } }).sort({ order: 1 }).lean();
  if (after && !before) before = await find({ order: { $lt: after.order } }).sort({ order: -1 }).lean();

  let order: number;
  if (!before && !after) {
    order = (await IssueModel.exists(column)) ? await orderAtEnd(project._id, status) : orderBetween();
  } else {
    let b = before?.order;
    let a = after?.order;
    if (needsRebalance(b, a)) {
      const renumbered = await rebalanceColumn(project._id, status, issue._id);
      b = before ? renumbered.get(before.number) : undefined;
      a = after ? renumbered.get(after.number) : undefined;
    }
    order = orderBetween(b, a);
  }

  await IssueModel.updateOne({ _id: issue._id }, { $set: { status, order } });

  refresh(project.key, num.data);
  return { ok: true, data: undefined };
}
