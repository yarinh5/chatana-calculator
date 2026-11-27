export const HEALTH_AREAS = [
  "budget",
  "payments",
  "rsvp",
  "vendors",
  "tasks",
  "seating",
  "documents",
] as const;

export type HealthArea = (typeof HEALTH_AREAS)[number];
export type HealthActionCode =
  | "REVIEW_BUDGET"
  | "CLEAR_OVERDUE_PAYMENTS"
  | "COLLECT_RSVP"
  | "CONFIRM_VENDORS"
  | "COMPLETE_OVERDUE_TASKS"
  | "ASSIGN_SEATS"
  | "COMPLETE_DOCUMENTS"
  | "COMPLETE_HEALTH_DATA";

export type HealthScoreInput = {
  /** Explicit aggregate countdown; never read the clock inside this module. */
  daysUntilWedding?: number | null;
  budget?: { plannedAmount: number; projectedAmount: number } | null;
  payments?: { dueCount: number; overdueCount: number } | null;
  rsvp?: { invitedCount: number; respondedCount: number } | null;
  vendors?: { requiredCount: number; confirmedCount: number } | null;
  tasks?: { openCount: number; overdueCount: number } | null;
  seating?: { guestCount: number; seatedCount: number } | null;
  documents?: { requiredCount: number; completeCount: number } | null;
};

export type HealthDeduction = { code: HealthActionCode; points: number };
export type AreaHealth = { score: number; deductions: HealthDeduction[] };
export type HealthScoreResult = {
  score: number | null;
  areas: Record<HealthArea, AreaHealth | null>;
  coverage: {
    availableAreas: number;
    totalAreas: 7;
    weightedPercent: number;
    missingAreas: HealthArea[];
    weddingDateAvailable: boolean;
    sufficient: boolean;
  };
  recommendedActions: HealthActionCode[];
};

const WEIGHTS: Record<HealthArea, number> = {
  budget: 20,
  payments: 15,
  rsvp: 15,
  vendors: 15,
  tasks: 15,
  seating: 12,
  documents: 8,
};

const ACTIONS: Record<HealthArea, HealthActionCode> = {
  budget: "REVIEW_BUDGET",
  payments: "CLEAR_OVERDUE_PAYMENTS",
  rsvp: "COLLECT_RSVP",
  vendors: "CONFIRM_VENDORS",
  tasks: "COMPLETE_OVERDUE_TASKS",
  seating: "ASSIGN_SEATS",
  documents: "COMPLETE_DOCUMENTS",
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const nonNegative = (value: number) => Number.isFinite(value) && value >= 0;
const count = (value: number) => nonNegative(value) && Number.isInteger(value);
const validPair = (total: number, done: number, allowZero: boolean) =>
  count(total) && count(done) && done <= total && (allowZero || total > 0);

function area(points: number, code: HealthActionCode): AreaHealth {
  const deducted = clamp(points);
  return {
    score: 100 - deducted,
    deductions: deducted ? [{ code, points: deducted }] : [],
  };
}

function urgency(days: number, distant: number, middle: number, near: number): number {
  if (days > 90) return distant;
  if (days > 30) return middle;
  if (days > 7) return near;
  return 1;
}

/** Deterministic score from aggregate planning signals, with explicit missing-data coverage. */
export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const daysAvailable =
    typeof input.daysUntilWedding === "number" && Number.isFinite(input.daysUntilWedding);
  const days = daysAvailable ? Number(input.daysUntilWedding) : 0;
  const areas: Record<HealthArea, AreaHealth | null> = {
    budget: null,
    payments: null,
    rsvp: null,
    vendors: null,
    tasks: null,
    seating: null,
    documents: null,
  };

  const budget = input.budget;
  if (
    budget &&
    Number.isFinite(budget.plannedAmount) &&
    budget.plannedAmount > 0 &&
    nonNegative(budget.projectedAmount)
  ) {
    const excess = Math.max(0, budget.projectedAmount - budget.plannedAmount);
    areas.budget = area((excess / budget.plannedAmount) * 200, ACTIONS.budget);
  }

  const payments = input.payments;
  if (payments && validPair(payments.dueCount, payments.overdueCount, true)) {
    const ratio = payments.dueCount ? payments.overdueCount / payments.dueCount : 0;
    areas.payments = area(payments.overdueCount * 10 + ratio * 60, ACTIONS.payments);
  }

  const rsvp = input.rsvp;
  if (daysAvailable && rsvp && validPair(rsvp.invitedCount, rsvp.respondedCount, false)) {
    const missing = 1 - rsvp.respondedCount / rsvp.invitedCount;
    areas.rsvp = area(missing * 100 * urgency(days, 0.25, 0.5, 0.8), ACTIONS.rsvp);
  }

  const vendors = input.vendors;
  if (daysAvailable && vendors && validPair(vendors.requiredCount, vendors.confirmedCount, false)) {
    const missing = 1 - vendors.confirmedCount / vendors.requiredCount;
    areas.vendors = area(missing * 100 * urgency(days, 0.4, 0.65, 0.85), ACTIONS.vendors);
  }

  const tasks = input.tasks;
  if (tasks && validPair(tasks.openCount, tasks.overdueCount, true)) {
    const ratio = tasks.openCount ? tasks.overdueCount / tasks.openCount : 0;
    areas.tasks = area(tasks.overdueCount * 8 + ratio * 60, ACTIONS.tasks);
  }

  const seating = input.seating;
  if (daysAvailable && seating && validPair(seating.guestCount, seating.seatedCount, false)) {
    const missing = 1 - seating.seatedCount / seating.guestCount;
    areas.seating = area(missing * 100 * urgency(days, 0.2, 0.45, 0.75), ACTIONS.seating);
  }

  const documents = input.documents;
  if (
    daysAvailable &&
    documents &&
    validPair(documents.requiredCount, documents.completeCount, false)
  ) {
    const missing = 1 - documents.completeCount / documents.requiredCount;
    areas.documents = area(missing * 100 * urgency(days, 0.3, 0.55, 0.8), ACTIONS.documents);
  }

  const available = HEALTH_AREAS.filter((name) => areas[name] !== null);
  const weightedPercent = available.reduce((sum, name) => sum + WEIGHTS[name], 0);
  const sufficient = daysAvailable && available.length >= 5 && weightedPercent >= 70;
  const score = sufficient
    ? clamp(
        available.reduce((sum, name) => sum + areas[name]!.score * WEIGHTS[name], 0) /
          weightedPercent,
      )
    : null;
  const rankedActions = available
    .filter((name) => areas[name]!.deductions.length > 0)
    .sort(
      (a, b) =>
        (100 - areas[b]!.score) * WEIGHTS[b] - (100 - areas[a]!.score) * WEIGHTS[a] ||
        HEALTH_AREAS.indexOf(a) - HEALTH_AREAS.indexOf(b),
    )
    .map((name) => ACTIONS[name]);

  return {
    score,
    areas,
    coverage: {
      availableAreas: available.length,
      totalAreas: 7,
      weightedPercent,
      missingAreas: HEALTH_AREAS.filter((name) => areas[name] === null),
      weddingDateAvailable: daysAvailable,
      sufficient,
    },
    recommendedActions:
      available.length === HEALTH_AREAS.length
        ? rankedActions
        : ["COMPLETE_HEALTH_DATA", ...rankedActions],
  };
}
