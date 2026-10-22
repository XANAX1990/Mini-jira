import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { ProjectModel, type Project, type Role } from "@/models/Project";
import { IssueModel, STATUSES, type Status } from "@/models/Issue";
import { UserModel } from "@/models/User";

export type ProjectListItem = { id: string; name: string; key: string; role: Role };

export async function listMyProjects(userId: string): Promise<ProjectListItem[]> {
  await connectDB();
  const uid = new Types.ObjectId(userId);
  const projects = await ProjectModel.find({ "members.userId": uid })
    .sort({ name: 1 })
    .lean();
  return projects.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    key: p.key,
    role: (p.members.find((m) => m.userId.equals(uid))?.role ?? "member") as Role,
  }));
}

export type MemberItem = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
};

export async function listProjectMembers(project: Project): Promise<MemberItem[]> {
  await connectDB();
  const users = await UserModel.find({ _id: { $in: project.members.map((m) => m.userId) } })
    .select("name email image")
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return project.members.flatMap((m) => {
    const u = byId.get(m.userId.toString());
    if (!u) return [];
    return [
      {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        image: u.image ?? null,
        role: m.role as Role,
      },
    ];
  });
}

export type IssueItem = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  priority: string;
  type: string;
  assigneeId: string | null;
  reporterId: string;
  order: number;
};

type IssueLean = Awaited<ReturnType<typeof findIssues>>[number];

function findIssues(filter: Record<string, unknown>) {
  return IssueModel.find(filter).sort({ status: 1, order: 1 }).lean();
}

function toIssueItem(i: IssueLean): IssueItem {
  return {
    id: i._id.toString(),
    number: i.number,
    title: i.title,
    description: i.description ?? "",
    status: i.status as Status,
    priority: i.priority ?? "medium",
    type: i.type ?? "task",
    assigneeId: i.assigneeId ? i.assigneeId.toString() : null,
    reporterId: i.reporterId.toString(),
    order: i.order,
  };
}

/** All issues of a project in one query, grouped by column and sorted by order. */
export async function listIssuesByStatus(projectId: Types.ObjectId) {
  await connectDB();
  const issues = await findIssues({ projectId });
  const grouped = Object.fromEntries(STATUSES.map((s) => [s, [] as IssueItem[]])) as Record<
    Status,
    IssueItem[]
  >;
  for (const i of issues) grouped[i.status as Status].push(toIssueItem(i));
  for (const s of STATUSES) grouped[s].sort((a, b) => a.order - b.order);
  return grouped;
}

export async function getIssue(projectId: Types.ObjectId, number: number) {
  await connectDB();
  const issue = await IssueModel.findOne({ projectId, number }).lean();
  return issue ? toIssueItem(issue) : null;
}
