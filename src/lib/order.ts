import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { IssueModel, type Status } from "@/models/Issue";

const STEP = 1000;

/** Order value that puts a card at the bottom of a column. */
export async function orderAtEnd(projectId: Types.ObjectId, status: Status) {
  await connectDB();
  const last = await IssueModel.findOne({ projectId, status })
    .sort({ order: -1 })
    .select("order")
    .lean();
  return last ? last.order + STEP : STEP;
}
