import { Schema, model, models, Types, type InferSchemaType, type Model } from "mongoose";

export const STATUSES = ["todo", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const TYPES = ["task", "bug"] as const;

export type Status = (typeof STATUSES)[number];

const IssueSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    number: { type: Number, required: true }, // shown as KEY-number, e.g. MJ-12
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "" },
    status: { type: String, enum: STATUSES, default: "todo" },
    priority: { type: String, enum: PRIORITIES, default: "medium" },
    type: { type: String, enum: TYPES, default: "task" },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Position inside a Kanban column. Float so a card dropped between
    // two others can take the midpoint without renumbering the column.
    order: { type: Number, required: true },
  },
  { timestamps: true }
);

// No duplicate MJ-12 inside the same project
IssueSchema.index({ projectId: 1, number: 1 }, { unique: true });
// Loading the board: all issues of a project, grouped by column, sorted
IssueSchema.index({ projectId: 1, status: 1, order: 1 });

export type Issue = InferSchemaType<typeof IssueSchema> & { _id: Types.ObjectId };

export const IssueModel: Model<Issue> =
  (models.Issue as Model<Issue>) || model<Issue>("Issue", IssueSchema);
