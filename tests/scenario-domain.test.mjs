import assert from "node:assert/strict";
import { test } from "node:test";
import { compareScenarios, simulateScenario } from "../src/lib/scenario-domain.ts";

const current = {
  invitedGuests: 100,
  attendanceRate: 0.8,
  mealPrice: 300,
  extraCostPerAttendee: 20,
  fixedCosts: 10000,
  averageGift: 500,
  budget: 40000,
};

test("calculates hypothetical attendance, costs, gifts and break-even", () => {
  assert.deepEqual(simulateScenario(current), {
    expectedAttendees: 80,
    expectedExpenses: 35600,
    expectedGiftIncome: 40000,
    expectedProfit: 4400,
    budgetVariance: 4400,
    breakEvenGift: 445,
  });
});

test("compares alternatives without mutating the actual scenario", () => {
  const alternative = { ...current, invitedGuests: 90 };
  const original = structuredClone(current);
  const difference = compareScenarios(simulateScenario(current), simulateScenario(alternative));
  assert.deepEqual(difference, {
    expenseDifference: -2560,
    incomeDifference: -4000,
    profitDifference: -1440,
    potentialSavings: 2560,
  });
  assert.deepEqual(current, original);
});

test("handles no attendees without inventing a break-even envelope", () => {
  const result = simulateScenario({ ...current, invitedGuests: 0 });
  assert.equal(result.breakEvenGift, null);
  assert.equal(result.expectedExpenses, current.fixedCosts);
  assert.equal(result.expectedGiftIncome, 0);
});

test("actual guest count overrides the estimate and vendor costs add to expenses", () => {
  const result = simulateScenario({
    ...current,
    actualGuests: 50,
    vendorCosts: 5000,
  });
  assert.deepEqual(result, {
    expectedAttendees: 50,
    expectedExpenses: 31000,
    expectedGiftIncome: 25000,
    expectedProfit: -6000,
    budgetVariance: 9000,
    breakEvenGift: 620,
  });
  assert.equal(simulateScenario({ ...current, actualGuests: 0 }).expectedAttendees, 0);
  assert.equal(simulateScenario({ ...current, actualGuests: null }).expectedAttendees, 80);
});

test("saving in expenses is separate from profit when income also changes", () => {
  const alternative = simulateScenario({ ...current, invitedGuests: 90 });
  const comparison = compareScenarios(simulateScenario(current), alternative);
  assert.equal(comparison.potentialSavings, 2560);
  assert.equal(comparison.profitDifference, -1440);
});

test("rejects invalid rates, counts and money", () => {
  assert.throws(() => simulateScenario({ ...current, attendanceRate: 1.5 }), /attendanceRate/);
  assert.throws(() => simulateScenario({ ...current, invitedGuests: 1.2 }), /invitedGuests/);
  assert.throws(() => simulateScenario({ ...current, averageGift: -1 }), /averageGift/);
  assert.throws(() => simulateScenario({ ...current, actualGuests: 1.2 }), /actualGuests/);
  assert.throws(() => simulateScenario({ ...current, vendorCosts: -1 }), /vendorCosts/);
  assert.throws(() => simulateScenario({ ...current, mealPrice: 1.234 }), /mealPrice/);
});

test("rejects monetary overflow even when attendee count itself is safe", () => {
  assert.throws(
    () =>
      simulateScenario({
        ...current,
        invitedGuests: Number.MAX_SAFE_INTEGER,
        attendanceRate: 1,
        mealPrice: 1,
        extraCostPerAttendee: 0,
        fixedCosts: 0,
        averageGift: 0,
        budget: 0,
      }),
    /attendee cost is too large/,
  );
  assert.throws(
    () =>
      simulateScenario({
        ...current,
        actualGuests: 0,
        mealPrice: 50_000_000_000_000,
        extraCostPerAttendee: 50_000_000_000_000,
        fixedCosts: 0,
        averageGift: 0,
        budget: 0,
      }),
    /per-attendee cost is too large/,
  );
});
