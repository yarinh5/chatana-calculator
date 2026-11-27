import assert from "node:assert/strict";
import test from "node:test";
import { calculateHealthScore } from "./health-score.ts";

const fullSignals = {
  daysUntilWedding: 5,
  budget: { plannedAmount: 100_000, projectedAmount: 100_000 },
  payments: { dueCount: 10, overdueCount: 0 },
  rsvp: { invitedCount: 100, respondedCount: 100 },
  vendors: { requiredCount: 5, confirmedCount: 5 },
  tasks: { openCount: 0, overdueCount: 0 },
  seating: { guestCount: 100, seatedCount: 100 },
  documents: { requiredCount: 4, completeCount: 4 },
};

test("missing seating is less severe far from the wedding than near it", () => {
  const far = calculateHealthScore({
    ...fullSignals,
    daysUntilWedding: 150,
    seating: { guestCount: 100, seatedCount: 0 },
  });
  const near = calculateHealthScore({
    ...fullSignals,
    daysUntilWedding: 2,
    seating: { guestCount: 100, seatedCount: 0 },
  });
  assert.equal(far.areas.seating.score, 80);
  assert.equal(near.areas.seating.score, 0);
  assert.ok(far.score > near.score);
  assert.deepEqual(near.areas.seating.deductions, [{ code: "ASSIGN_SEATS", points: 100 }]);
});

test("scores stay in bounds even with severe valid deficits", () => {
  const result = calculateHealthScore({
    ...fullSignals,
    budget: { plannedAmount: 1, projectedAmount: 1_000_000 },
    payments: { dueCount: 100, overdueCount: 100 },
    rsvp: { invitedCount: 100, respondedCount: 0 },
    vendors: { requiredCount: 10, confirmedCount: 0 },
    tasks: { openCount: 100, overdueCount: 100 },
    seating: { guestCount: 100, seatedCount: 0 },
    documents: { requiredCount: 5, completeCount: 0 },
  });
  assert.equal(result.score, 0);
  for (const item of Object.values(result.areas)) {
    assert.ok(item.score >= 0 && item.score <= 100);
    assert.ok(
      item.deductions.every((deduction) => deduction.points >= 0 && deduction.points <= 100),
    );
  }
});

test("missing or invalid signals reduce coverage and withhold an unsupported overall score", () => {
  const partial = calculateHealthScore({
    daysUntilWedding: 60,
    budget: { plannedAmount: 100, projectedAmount: 120 },
    payments: { dueCount: 3, overdueCount: 1 },
    rsvp: { invitedCount: 0, respondedCount: 0 },
    vendors: { requiredCount: 5, confirmedCount: 4 },
  });
  assert.equal(partial.score, null);
  assert.equal(partial.coverage.availableAreas, 3);
  assert.equal(partial.coverage.weightedPercent, 50);
  assert.ok(partial.coverage.missingAreas.includes("rsvp"));
  assert.equal(partial.recommendedActions[0], "COMPLETE_HEALTH_DATA");

  const noDate = calculateHealthScore({ ...fullSignals, daysUntilWedding: null });
  assert.equal(noDate.score, null);
  assert.equal(noDate.coverage.weddingDateAvailable, false);
  assert.equal(noDate.areas.seating, null);
});

test("complete healthy evidence yields 100 with no deductions or actions", () => {
  const result = calculateHealthScore(fullSignals);
  assert.equal(result.score, 100);
  assert.equal(result.coverage.weightedPercent, 100);
  assert.deepEqual(result.coverage.missingAreas, []);
  assert.deepEqual(result.recommendedActions, []);
});

test("same aggregate input produces identical ranked explanations", () => {
  const input = {
    ...fullSignals,
    budget: { plannedAmount: 100, projectedAmount: 120 },
    payments: { dueCount: 5, overdueCount: 2 },
    rsvp: { invitedCount: 100, respondedCount: 0 },
  };
  const first = calculateHealthScore(input);
  assert.deepEqual(calculateHealthScore(structuredClone(input)), first);
  assert.deepEqual(first.areas.budget.deductions, [{ code: "REVIEW_BUDGET", points: 40 }]);
  assert.equal(first.recommendedActions[0], "COLLECT_RSVP");
});
