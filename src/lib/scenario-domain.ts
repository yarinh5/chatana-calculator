/** Scenario inputs are hypothetical; this module never reads or writes event records. */
export type ScenarioInput = {
  invitedGuests: number;
  attendanceRate: number; // 0..1
  mealPrice: number;
  extraCostPerAttendee: number;
  fixedCosts: number;
  averageGift: number;
  budget: number;
};

export type ScenarioResult = {
  expectedAttendees: number;
  expectedExpenses: number;
  expectedGiftIncome: number;
  expectedProfit: number;
  budgetVariance: number;
  breakEvenGift: number | null;
};

function nonnegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${field} must be nonnegative`);
  return value;
}

function moneyToCents(value: number, field: string): number {
  const cents = Math.round(nonnegative(value, field) * 100);
  if (!Number.isSafeInteger(cents)) throw new RangeError(`${field} is too large`);
  return cents;
}

export function simulateScenario(input: ScenarioInput): ScenarioResult {
  if (!Number.isSafeInteger(input.invitedGuests) || input.invitedGuests < 0) {
    throw new RangeError("invitedGuests must be a nonnegative integer");
  }
  if (
    !Number.isFinite(input.attendanceRate) ||
    input.attendanceRate < 0 ||
    input.attendanceRate > 1
  ) {
    throw new RangeError("attendanceRate must be between 0 and 1");
  }
  const expectedAttendees = Math.round(input.invitedGuests * input.attendanceRate);
  const perAttendee =
    moneyToCents(input.mealPrice, "mealPrice") +
    moneyToCents(input.extraCostPerAttendee, "extraCostPerAttendee");
  const expectedExpensesCents =
    moneyToCents(input.fixedCosts, "fixedCosts") + expectedAttendees * perAttendee;
  const expectedGiftIncomeCents =
    expectedAttendees * moneyToCents(input.averageGift, "averageGift");
  const budgetCents = moneyToCents(input.budget, "budget");
  if (![expectedExpensesCents, expectedGiftIncomeCents].every(Number.isSafeInteger)) {
    throw new RangeError("scenario total is too large");
  }
  return {
    expectedAttendees,
    expectedExpenses: expectedExpensesCents / 100,
    expectedGiftIncome: expectedGiftIncomeCents / 100,
    expectedProfit: (expectedGiftIncomeCents - expectedExpensesCents) / 100,
    budgetVariance: (budgetCents - expectedExpensesCents) / 100,
    breakEvenGift:
      expectedAttendees === 0 ? null : Math.ceil(expectedExpensesCents / expectedAttendees) / 100,
  };
}

export function compareScenarios(current: ScenarioResult, alternative: ScenarioResult) {
  return {
    expenseDifference: alternative.expectedExpenses - current.expectedExpenses,
    incomeDifference: alternative.expectedGiftIncome - current.expectedGiftIncome,
    profitDifference: alternative.expectedProfit - current.expectedProfit,
  };
}
