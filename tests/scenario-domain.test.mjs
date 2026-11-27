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
  });
  assert.deepEqual(current, original);
});

test("handles no attendees without inventing a break-even envelope", () => {
  const result = simulateScenario({ ...current, invitedGuests: 0 });
  assert.equal(result.breakEvenGift, null);
  assert.equal(result.expectedExpenses, current.fixedCosts);
  assert.equal(result.expectedGiftIncome, 0);
});

test("rejects invalid rates, counts and money", () => {
  assert.throws(() => simulateScenario({ ...current, attendanceRate: 1.5 }), /attendanceRate/);
  assert.throws(() => simulateScenario({ ...current, invitedGuests: 1.2 }), /invitedGuests/);
  assert.throws(() => simulateScenario({ ...current, averageGift: -1 }), /averageGift/);
});
