// Usage: npm run seed -- you@example.com [KEY]
// Creates a demo project (key DEMO unless you pass another) with sample issues
// for a user who has signed in once.
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { IssueModel } from "@/models/Issue";
import { ProjectModel } from "@/models/Project";
import { UserModel } from "@/models/User";

type Seed = [
  title: string,
  status: "todo" | "in_progress" | "done",
  type: "task" | "bug",
  priority: "low" | "medium" | "high",
  mine: boolean,
];

const ISSUES: Seed[] = [
  ["Design the landing page hero", "todo", "task", "medium", false],
  ["Login redirects to a blank page on Safari", "todo", "bug", "high", true],
  ["Write onboarding copy for empty states", "todo", "task", "low", false],
  ["Add rate limiting to the public API", "todo", "task", "high", true],
  ["Upgrade dependencies", "todo", "task", "low", false],
  ["Dashboard chart flickers on resize", "in_progress", "bug", "medium", true],
  ["Implement CSV export for issues", "in_progress", "task", "medium", false],
  ["Fix timezone in due-date labels", "in_progress", "bug", "high", false],
  ["Set up error monitoring", "in_progress", "task", "medium", true],
  ["Create the project settings page", "done", "task", "medium", true],
  ["Drag and drop reorders cards", "done", "task", "high", true],
  ["Emails are case-sensitive on sign in", "done", "bug", "high", false],
  ["Add keyboard shortcuts help", "done", "task", "low", false],
  ["Wrong avatar shown after rename", "done", "bug", "low", true],
  ["Document the data model", "done", "task", "low", false],
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production");
  }
  const email = process.argv[2]?.trim().toLowerCase();
  const key = (process.argv[3] ?? "DEMO").trim().toUpperCase();
  if (!email) throw new Error("Usage: npm run seed -- you@example.com [KEY]");
  if (!/^[A-Z]{2,6}$/.test(key)) throw new Error("KEY must be 2-6 letters (A-Z)");

  await connectDB();

  const user = await UserModel.findOne({ email }).lean();
  if (!user) {
    throw new Error(`No user ${email}. Sign in to Mini Jira once first, then run the seed again.`);
  }
  if (await ProjectModel.exists({ key })) {
    throw new Error(`A project with key ${key} already exists. Delete it in its Settings first, or pass another KEY.`);
  }

  const project = await ProjectModel.create({
    name: "Demo Project",
    key,
    ownerId: user._id,
    members: [{ userId: user._id, role: "admin" }],
    issueCounter: ISSUES.length,
  });

  const perColumn = { todo: 0, in_progress: 0, done: 0 };
  await IssueModel.insertMany(
    ISSUES.map(([title, status, type, priority, mine], i) => ({
      projectId: project._id,
      number: i + 1,
      title,
      description: "",
      status,
      type,
      priority,
      assigneeId: mine ? user._id : null,
      reporterId: user._id,
      order: ++perColumn[status] * 1000,
    }))
  );

  console.log(`Created ${key} with ${ISSUES.length} issues for ${email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
