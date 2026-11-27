/** Financial amounts are ILS. `null` means the source was not loaded or not defined. */
export type FinancialLineInput = {
  id: string;
  category: string;
  vendorId: string | null;
  plannedCost: number | null;
  committedCost: number;
  /** Empty means loaded and unpaid; null means payments are unavailable. */
  payments: readonly number[] | null;
};

export type FinancialAmounts = {
  planned: number | null;
  committed: number;
  paid: number | null;
  remaining: number | null;
  overpaid: number | null;
  /** Positive means the commitment is below the plan. */
  variance: number | null;
};

export type FinancialSnapshot = {
  event: FinancialAmounts;
  expenses: ReadonlyMap<string, FinancialAmounts>;
  categories: ReadonlyMap<string, FinancialAmounts>;
  vendors: ReadonlyMap<string, FinancialAmounts>;
};

function cents(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite nonnegative amount`);
  }
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} is too large`);
  return result;
}

function amount(value: number | null, label: string): number | null {
  return value === null ? null : cents(value, label);
}

function sumKnown(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function toAmounts(
  planned: number | null,
  committed: number,
  paid: number | null,
): FinancialAmounts {
  return {
    planned: planned === null ? null : planned / 100,
    committed: committed / 100,
    paid: paid === null ? null : paid / 100,
    remaining: paid === null ? null : Math.max(0, committed - paid) / 100,
    overpaid: paid === null ? null : Math.max(0, paid - committed) / 100,
    variance: planned === null ? null : (planned - committed) / 100,
  };
}

/** Pure projection. Callers supply the effective committed cost from the existing expense model. */
export function buildFinancialSnapshot(
  lines: readonly FinancialLineInput[],
  eventPlannedBudget: number | null = null,
): FinancialSnapshot {
  const seen = new Set<string>();
  const expenses = new Map<string, FinancialAmounts>();
  const groups = (keyOf: (line: FinancialLineInput) => string | null) => {
    const grouped = new Map<string, FinancialAmounts[]>();
    for (const line of lines) {
      const key = keyOf(line);
      if (key === null) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), expenses.get(line.id)!]);
    }
    return new Map([...grouped].map(([key, values]) => [key, combine(values)]));
  };

  for (const line of lines) {
    if (!line.id || seen.has(line.id)) throw new Error(`duplicate or empty expense id: ${line.id}`);
    seen.add(line.id);
    const planned = amount(line.plannedCost, `plannedCost ${line.id}`);
    const committed = cents(line.committedCost, `committedCost ${line.id}`);
    const paid =
      line.payments === null
        ? null
        : line.payments.reduce((sum, payment) => sum + cents(payment, `payment ${line.id}`), 0);
    expenses.set(line.id, toAmounts(planned, committed, paid));
  }

  const aggregate = combine([...expenses.values()]);
  const explicitPlan = amount(eventPlannedBudget, "eventPlannedBudget");
  const event =
    explicitPlan === null
      ? aggregate
      : toAmounts(
          explicitPlan,
          cents(aggregate.committed, "committed total"),
          amount(aggregate.paid, "paid total"),
        );

  return {
    event,
    expenses,
    categories: groups((line) => line.category),
    vendors: groups((line) => line.vendorId),
  };
}

function combine(values: readonly FinancialAmounts[]): FinancialAmounts {
  const planned = sumKnown(values.map((value) => amount(value.planned, "planned")));
  const committed = values.reduce((sum, value) => sum + cents(value.committed, "committed"), 0);
  const paid = sumKnown(values.map((value) => amount(value.paid, "paid")));
  return toAmounts(planned, committed, paid);
}
