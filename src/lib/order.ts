import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { IssueModel, type Status } from "@/models/Issue";

const STEP = 1000;
/** Below this gap between two neighbours a midpoint is no longer safe: renumber the column. */
export const MIN_GAP = 0.001;

/** Order value that puts a card at the bottom of a column. */
export async function orderAtEnd(projectId: Types.ObjectId, status: Status) {
  await connectDB();
  const last = await IssueModel.findOne({ projectId, status })
    .sort({ order: -1 })
    .select("order")
    .lean();
  return last ? last.order + STEP : STEP;
}

/**
 * Order for a card dropped between `before` (the card above it) and `after`
 * (the card below it). Either can be missing: top of column, bottom, or empty column.
 */
export function orderBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return STEP;
  if (before === undefined) return after! - STEP;
  if (after === undefined) return before + STEP;
  return (before + after) / 2;
}

export function needsRebalance(before?: number, after?: number): boolean {
  return before !== undefined && after !== undefined && after - before < MIN_GAP;
}

/**
 * Renumber a column to 1000, 2000, 3000… in one bulkWrite, skipping `excludeId`
 * (the card being moved). Returns the new order of every card by issue number.
 */
export async function rebalanceColumn(
  projectId: Types.ObjectId,
  status: Status,
  excludeId: Types.ObjectId
) {
  await connectDB();
  const cards = await IssueModel.find({ projectId, status, _id: { $ne: excludeId } })
    .sort({ order: 1 })
    .select("number")
    .lean();
  const orders = new Map<number, number>();
  cards.forEach((c, i) => orders.set(c.number, (i + 1) * STEP));
  if (cards.length > 0) {
    await IssueModel.bulkWrite(
      cards.map((c) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: { order: orders.get(c.number)! } } },
      }))
    );
  }
  return orders;
}
