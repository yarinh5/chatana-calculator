/** Scenario inputs are hypothetical; this module never reads or writes event records. */
export type ScenarioInput = {
  invitedGuests: number;
  attendanceRate: number; // 0..1
  actualGuests?: number | null; // when entered, overrides the estimate from attendanceRate
  mealPrice: number;
  extraCostPerAttendee: number;
  vendorCosts?: number; // fixed vendor commitments in this hypothetical scenario
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
  return signedMoneyToCents(nonnegative(value, field), field);
}

function signedMoneyToCents(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`);
  const rawCents = value * 100;
  const cents = Math.round(rawCents);
  if (Math.abs(rawCents - cents) > 1e-7) throw new RangeError(`${field} allows two decimals`);
  if (!Number.isSafeInteger(cents)) throw new RangeError(`${field} is too large`);
  return cents;
}

function checkedSum(values: number[], field: string): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value)) {
      throw new RangeError(`${field} is too large`);
    }
    total += value;
  }
  return total;
}

function checkedProduct(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new RangeError(`${field} is too large`);
  }
  if (left !== 0 && Math.abs(right) > Number.MAX_SAFE_INTEGER / Math.abs(left)) {
    throw new RangeError(`${field} is too large`);
  }
  return left * right;
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
  if (
    input.actualGuests != null &&
    (!Number.isSafeInteger(input.actualGuests) || input.actualGuests < 0)
  ) {
    throw new RangeError("actualGuests must be a nonnegative integer");
  }
  const expectedAttendees =
    input.actualGuests ?? Math.round(input.invitedGuests * input.attendanceRate);
  if (!Number.isSafeInteger(expectedAttendees))
    throw new RangeError("expectedAttendees is too large");
  const perAttendee = checkedSum(
    [
      moneyToCents(input.mealPrice, "mealPrice"),
      moneyToCents(input.extraCostPerAttendee, "extraCostPerAttendee"),
    ],
    "per-attendee cost",
  );
  const expectedExpensesCents = checkedSum(
    [
      moneyToCents(input.fixedCosts, "fixedCosts"),
      moneyToCents(input.vendorCosts ?? 0, "vendorCosts"),
      checkedProduct(expectedAttendees, perAttendee, "attendee cost"),
    ],
    "scenario expenses",
  );
  const expectedGiftIncomeCents = checkedProduct(
    expectedAttendees,
    moneyToCents(input.averageGift, "averageGift"),
    "gift income",
  );
  const budgetCents = moneyToCents(input.budget, "budget");
  const profitCents = checkedSum(
    [expectedGiftIncomeCents, -expectedExpensesCents],
    "scenario profit",
  );
  const varianceCents = checkedSum([budgetCents, -expectedExpensesCents], "budget variance");
  return {
    expectedAttendees,
    expectedExpenses: expectedExpensesCents / 100,
    expectedGiftIncome: expectedGiftIncomeCents / 100,
    expectedProfit: profitCents / 100,
    budgetVariance: varianceCents / 100,
    breakEvenGift:
      expectedAttendees === 0 ? null : Math.ceil(expectedExpensesCents / expectedAttendees) / 100,
  };
}

export function compareScenarios(current: ScenarioResult, alternative: ScenarioResult) {
  const expenseDifferenceCents = checkedSum(
    [
      moneyToCents(alternative.expectedExpenses, "alternative expenses"),
      -moneyToCents(current.expectedExpenses, "current expenses"),
    ],
    "expense difference",
  );
  const incomeDifferenceCents = checkedSum(
    [
      moneyToCents(alternative.expectedGiftIncome, "alternative income"),
      -moneyToCents(current.expectedGiftIncome, "current income"),
    ],
    "income difference",
  );
  const profitDifferenceCents = checkedSum(
    [
      signedMoneyToCents(alternative.expectedProfit, "alternative profit"),
      -signedMoneyToCents(current.expectedProfit, "current profit"),
    ],
    "profit difference",
  );
  return {
    expenseDifference: expenseDifferenceCents / 100,
    incomeDifference: incomeDifferenceCents / 100,
    profitDifference: profitDifferenceCents / 100,
    potentialSavings: Math.max(0, -expenseDifferenceCents) / 100,
  };
}
