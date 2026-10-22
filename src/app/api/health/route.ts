// Temporary route to confirm the DB connection works.
// Open http://localhost:3000/api/health — delete this file once it says ok.
import { connectDB } from "@/lib/db";
import { UserModel } from "@/models/User";
import { ProjectModel } from "@/models/Project";
import { IssueModel } from "@/models/Issue";

export async function GET() {
  try {
    await connectDB();
    // Creates the collections + indexes in Atlas so you can see them
    await Promise.all([UserModel.init(), ProjectModel.init(), IssueModel.init()]);
    const counts = {
      users: await UserModel.countDocuments(),
      projects: await ProjectModel.countDocuments(),
      issues: await IssueModel.countDocuments(),
    };
    return Response.json({ ok: true, counts });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
