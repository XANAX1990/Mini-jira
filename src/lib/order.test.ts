import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  find: vi.fn(),
  bulkWrite: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: vi.fn() }));
vi.mock("@/models/Issue", () => ({ IssueModel: mocks }));

import { MIN_GAP, needsRebalance, orderAtEnd, orderBetween, rebalanceColumn } from "@/lib/order";

/** Mimics `Model.find().sort().select().lean()`. */
function query(result: unknown) {
  const q = { sort: () => q, select: () => q, lean: () => Promise.resolve(result) };
  return q;
}

describe("orderBetween", () => {
  it("takes the midpoint between two cards", () => {
    expect(orderBetween(1000, 2000)).toBe(1500);
    expect(orderBetween(0, 1)).toBe(0.5);
    expect(orderBetween(-1000, 1000)).toBe(0);
  });

  it("puts a card 1000 above the first one when dropped at the top", () => {
    expect(orderBetween(undefined, 1000)).toBe(0);
    expect(orderBetween(undefined, 0)).toBe(-1000);
  });

  it("puts a card 1000 below the last one when dropped at the bottom", () => {
    expect(orderBetween(3000, undefined)).toBe(4000);
    expect(orderBetween(-5, undefined)).toBe(995);
  });

  it("starts an empty column at 1000", () => {
    expect(orderBetween()).toBe(1000);
  });
});

describe("needsRebalance", () => {
  it("is false for a normal gap and for exactly MIN_GAP", () => {
    expect(needsRebalance(1000, 2000)).toBe(false);
    expect(needsRebalance(0, MIN_GAP)).toBe(false);
  });

  it("is true once the gap is smaller than MIN_GAP", () => {
    expect(needsRebalance(0, MIN_GAP / 2)).toBe(true);
    expect(needsRebalance(1000, 1000)).toBe(true);
  });

  it("never asks for a rebalance when a neighbour is missing", () => {
    expect(needsRebalance(undefined, 5)).toBe(false);
    expect(needsRebalance(5, undefined)).toBe(false);
    expect(needsRebalance()).toBe(false);
  });

  it("triggers after exactly 20 halvings of the initial 1000 gap", () => {
    // Dropping every new card right above the previous one halves the gap each time.
    const before = 1000;
    let after = 2000;
    let halvings = 0;
    while (!needsRebalance(before, after)) {
      after = orderBetween(before, after);
      halvings++;
    }
    expect(halvings).toBe(20); // 1000 / 2^20 = 0.00095 < 0.001
  });

  it("keeps 60 cards in the right order when rebalancing on demand", () => {
    // Same algorithm as moveIssue: midpoint, renumbering the column when the gap is too small.
    let column = [1000, 2000]; // card ids: 0 = first, 1 = last
    const ids = [0, 1];
    for (let n = 0; n < 60; n++) {
      const index = 1; // always right below the first card
      let b: number | undefined = column[index - 1];
      let a: number | undefined = column[index];
      if (needsRebalance(b, a)) {
        column = column.map((_, i) => (i + 1) * 1000);
        b = column[index - 1];
        a = column[index];
      }
      column.splice(index, 0, orderBetween(b, a));
      ids.splice(index, 0, 100 + n);
    }
    expect(column).toHaveLength(62);
    expect(column.every((o, i) => i === 0 || o > column[i - 1])).toBe(true);
    // the card dropped last sits right under the first one, the first dropped right above the last
    expect(ids[0]).toBe(0);
    expect(ids[1]).toBe(159);
    expect(ids[60]).toBe(100);
    expect(ids[61]).toBe(1);
  });
});

describe("orderAtEnd", () => {
  beforeEach(() => vi.clearAllMocks());
  const projectId = new Types.ObjectId();

  it("is 1000 for an empty column", async () => {
    mocks.findOne.mockReturnValue(query(null));
    expect(await orderAtEnd(projectId, "todo")).toBe(1000);
  });

  it("is the highest order in the column plus 1000", async () => {
    mocks.findOne.mockReturnValue(query({ order: 4500 }));
    expect(await orderAtEnd(projectId, "done")).toBe(5500);
    expect(mocks.findOne).toHaveBeenCalledWith({ projectId, status: "done" });
  });
});

describe("rebalanceColumn", () => {
  beforeEach(() => vi.clearAllMocks());
  const projectId = new Types.ObjectId();
  const moving = new Types.ObjectId();

  it("renumbers the column to 1000, 2000, 3000… in a single bulkWrite, skipping the moved card", async () => {
    const cards = [
      { _id: new Types.ObjectId(), number: 5 },
      { _id: new Types.ObjectId(), number: 9 },
      { _id: new Types.ObjectId(), number: 2 },
    ];
    mocks.find.mockReturnValue(query(cards));

    const orders = await rebalanceColumn(projectId, "in_progress", moving);

    expect(mocks.find).toHaveBeenCalledWith({
      projectId,
      status: "in_progress",
      _id: { $ne: moving },
    });
    expect([...orders]).toEqual([
      [5, 1000],
      [9, 2000],
      [2, 3000],
    ]);
    expect(mocks.bulkWrite).toHaveBeenCalledTimes(1);
    expect(mocks.bulkWrite).toHaveBeenCalledWith(
      cards.map((c, i) => ({
        updateOne: { filter: { _id: c._id }, update: { $set: { order: (i + 1) * 1000 } } },
      }))
    );
  });

  it("does not write anything for an empty column", async () => {
    mocks.find.mockReturnValue(query([]));
    expect((await rebalanceColumn(projectId, "todo", moving)).size).toBe(0);
    expect(mocks.bulkWrite).not.toHaveBeenCalled();
  });
});
