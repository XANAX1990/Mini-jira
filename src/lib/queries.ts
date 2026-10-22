import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { ProjectModel, type Role } from "@/models/Project";

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
