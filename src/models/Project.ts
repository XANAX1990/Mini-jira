import { Schema, model, models, Types, type InferSchemaType, type Model } from "mongoose";

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

const MemberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, default: "member" },
  },
  { _id: false }
);

const ProjectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Short prefix for issue IDs, e.g. "MJ" -> MJ-1, MJ-2
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{2,6}$/,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: { type: [MemberSchema], default: [] },
    // Next issue number; bump atomically with $inc when creating an issue
    issueCounter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Fast lookup: "which projects is this user in?"
ProjectSchema.index({ "members.userId": 1 });

export type Project = InferSchemaType<typeof ProjectSchema> & { _id: Types.ObjectId };

export const ProjectModel: Model<Project> =
  (models.Project as Model<Project>) || model<Project>("Project", ProjectSchema);
