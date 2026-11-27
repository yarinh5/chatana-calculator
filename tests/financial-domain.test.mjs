import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFinancialSnapshot } from "../src/lib/financial-domain.ts";

test("separates plan, commitment, paid, remaining and variance at every level", () => {
  const snapshot = buildFinancialSnapshot([
    {
      id: "a",
      category: "venue",
      vendorId: "v1",
      plannedCost: 120,
      committedCost: 100,
      payments: [20.1, 30.2],
    },
    {
      id: "b",
      category: "venue",
      vendorId: "v1",
      plannedCost: 80,
      committedCost: 90,
      payments: [],
    },
  ]);
  assert.deepEqual(snapshot.event, {
    planned: 200,
    committed: 190,
    paid: 50.3,
    remaining: 139.7,
    overpaid: 0,
    variance: 10,
  });
  assert.deepEqual(snapshot.categories.get("venue"), snapshot.event);
  assert.deepEqual(snapshot.vendors.get("v1"), snapshot.event);
  assert.equal(snapshot.expenses.get("a").remaining, 49.7);
});

test("does not turn unavailable payments or plans into zero", () => {
  const snapshot = buildFinancialSnapshot(
    [
      {
        id: "a",
        category: "venue",
        vendorId: null,
        plannedCost: null,
        committedCost: 100,
        payments: null,
      },
    ],
    150,
  );
  assert.equal(snapshot.event.planned, 150);
  assert.equal(snapshot.event.paid, null);
  assert.equal(snapshot.event.remaining, null);
  assert.equal(snapshot.expenses.get("a").planned, null);
  assert.equal(snapshot.categories.get("venue").variance, null);
});

test("empty event has no implied plan, while overpayment is separate from remaining", () => {
  assert.deepEqual(buildFinancialSnapshot([]).event, {
    planned: null,
    committed: 0,
    paid: 0,
    remaining: 0,
    overpaid: 0,
    variance: null,
  });
  assert.equal(buildFinancialSnapshot([], 0).event.planned, 0, "explicit zero plan is distinct");
  const snapshot = buildFinancialSnapshot([
    {
      id: "a",
      category: "music",
      vendorId: null,
      plannedCost: 90,
      committedCost: 100,
      payments: [110],
    },
  ]);
  assert.equal(snapshot.event.remaining, 0);
  assert.equal(snapshot.event.overpaid, 10);
  assert.equal(snapshot.event.variance, -10);
});

test("rejects duplicate IDs and invalid financial amounts", () => {
  const line = {
    id: "a",
    category: "music",
    vendorId: null,
    plannedCost: 10,
    committedCost: 10,
    payments: [],
  };
  assert.throws(() => buildFinancialSnapshot([line, line]), /duplicate/);
  assert.throws(() => buildFinancialSnapshot([{ ...line, committedCost: -1 }]), /nonnegative/);
  assert.throws(() => buildFinancialSnapshot([{ ...line, payments: [Number.NaN] }]), /nonnegative/);
});
