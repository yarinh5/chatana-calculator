import type { FinancialSnapshot } from "./financial-domain.ts";
import type { ScenarioResult } from "./scenario-domain.ts";
import { HEALTH_AREAS, type HealthArea, type HealthScoreResult } from "./health-score.ts";

export type AdvisorRequest = {
  version: 1;
  finance: {
    planned: number | null;
    committed: number;
    paid: number | null;
    remaining: number | null;
    overpaid: number | null;
    variance: number | null;
  } | null;
  scenario: {
    expectedAttendees: number;
    expectedExpenses: number;
    expectedGiftIncome: number;
    expectedProfit: number;
    budgetVariance: number;
    breakEvenGift: number | null;
  } | null;
  health: {
    score: number | null;
    coveragePercent: number;
    areaScores: Record<HealthArea, number | null>;
  } | null;
};

export const ADVISOR_ACTION_CODES = [
  "REVIEW_BUDGET",
  "CHECK_PAYMENTS",
  "FOLLOW_UP_RSVP",
  "CONFIRM_VENDORS",
  "REVIEW_TASKS",
  "REVIEW_SEATING",
  "REVIEW_DOCUMENTS",
] as const;

export type AdvisorActionCode = (typeof ADVISOR_ACTION_CODES)[number];
export type AdvisorResponse = {
  version: 1;
  summary: string;
  recommendations: { code: AdvisorActionCode; reason: string }[];
};

export type AdvisorResult =
  | { ok: true; response: AdvisorResponse }
  | {
      ok: false;
      error: "unavailable" | "invalid_request" | "invalid_response" | "provider_error";
    };

export type AdvisorProvider = (request: AdvisorRequest) => Promise<unknown>;

/** Local composer validation only. The question is never part of AdvisorRequest. */
export function validateLocalAdvisorQuestion(value: string): "empty" | "too_long" | null {
  const length = value.trim().length;
  if (!length) return "empty";
  if (length > 300) return "too_long";
  return null;
}

/** Select aggregate fields only; never serialize expense/vendor IDs or personal records. */
export function buildAdvisorRequest(input: {
  financial?: FinancialSnapshot | null;
  scenario?: ScenarioResult | null;
  health?: HealthScoreResult | null;
}): AdvisorRequest {
  const event = input.financial?.event;
  const scenario = input.scenario;
  const health = input.health;
  return {
    version: 1,
    finance: event
      ? {
          planned: event.planned,
          committed: event.committed,
          paid: event.paid,
          remaining: event.remaining,
          overpaid: event.overpaid,
          variance: event.variance,
        }
      : null,
    scenario: scenario
      ? {
          expectedAttendees: scenario.expectedAttendees,
          expectedExpenses: scenario.expectedExpenses,
          expectedGiftIncome: scenario.expectedGiftIncome,
          expectedProfit: scenario.expectedProfit,
          budgetVariance: scenario.budgetVariance,
          breakEvenGift: scenario.breakEvenGift,
        }
      : null,
    health: health
      ? {
          score: health.score,
          coveragePercent: health.coverage.weightedPercent,
          areaScores: Object.fromEntries(
            HEALTH_AREAS.map((name) => [name, health.areas[name]?.score ?? null]),
          ) as Record<HealthArea, number | null>,
        }
      : null,
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const amount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nullableAmount = (value: unknown) => value === null || amount(value);
const nonnegativeAmount = (value: unknown) => amount(value) && value >= 0;
const nullableNonnegativeAmount = (value: unknown) => value === null || nonnegativeAmount(value);
const boundedScore = (value: unknown) =>
  value === null || (amount(value) && value >= 0 && value <= 100);

export function validateAdvisorRequest(value: unknown): value is AdvisorRequest {
  if (!record(value) || !exactKeys(value, ["version", "finance", "scenario", "health"]))
    return false;
  if (value.version !== 1 || (!value.finance && !value.scenario && !value.health)) return false;

  if (value.finance !== null) {
    if (
      !record(value.finance) ||
      !exactKeys(value.finance, [
        "planned",
        "committed",
        "paid",
        "remaining",
        "overpaid",
        "variance",
      ]) ||
      !nullableNonnegativeAmount(value.finance.planned) ||
      !nonnegativeAmount(value.finance.committed) ||
      !nullableNonnegativeAmount(value.finance.paid) ||
      !nullableNonnegativeAmount(value.finance.remaining) ||
      !nullableNonnegativeAmount(value.finance.overpaid) ||
      !nullableAmount(value.finance.variance)
    )
      return false;
  }

  if (value.scenario !== null) {
    if (
      !record(value.scenario) ||
      !exactKeys(value.scenario, [
        "expectedAttendees",
        "expectedExpenses",
        "expectedGiftIncome",
        "expectedProfit",
        "budgetVariance",
        "breakEvenGift",
      ]) ||
      !nonnegativeAmount(value.scenario.expectedAttendees) ||
      !Number.isSafeInteger(value.scenario.expectedAttendees) ||
      !nonnegativeAmount(value.scenario.expectedExpenses) ||
      !nonnegativeAmount(value.scenario.expectedGiftIncome) ||
      !amount(value.scenario.expectedProfit) ||
      !amount(value.scenario.budgetVariance) ||
      !nullableNonnegativeAmount(value.scenario.breakEvenGift)
    )
      return false;
  }

  const healthValue = value.health;
  if (healthValue !== null) {
    if (
      !record(healthValue) ||
      !exactKeys(healthValue, ["score", "coveragePercent", "areaScores"]) ||
      !boundedScore(healthValue.score) ||
      !amount(healthValue.coveragePercent) ||
      healthValue.coveragePercent < 0 ||
      healthValue.coveragePercent > 100 ||
      !record(healthValue.areaScores) ||
      !exactKeys(healthValue.areaScores, HEALTH_AREAS)
    )
      return false;
    const areaScores = healthValue.areaScores as Record<string, unknown>;
    if (!HEALTH_AREAS.every((name) => boundedScore(areaScores[name]))) return false;
  }
  return true;
}

export function validateAdvisorResponse(value: unknown): value is AdvisorResponse {
  if (!record(value) || !exactKeys(value, ["version", "summary", "recommendations"])) return false;
  if (
    value.version !== 1 ||
    typeof value.summary !== "string" ||
    !value.summary.trim() ||
    value.summary.length > 500 ||
    !Array.isArray(value.recommendations) ||
    value.recommendations.length > 5
  )
    return false;
  return value.recommendations.every(
    (item) =>
      record(item) &&
      exactKeys(item, ["code", "reason"]) &&
      ADVISOR_ACTION_CODES.includes(item.code as AdvisorActionCode) &&
      typeof item.reason === "string" &&
      !!item.reason.trim() &&
      item.reason.length <= 300,
  );
}

/** No provider is configured in the app; a future backend can implement this boundary. */
export async function requestAdvisorAdvice(
  provider: AdvisorProvider | null,
  request: unknown,
): Promise<AdvisorResult> {
  if (!provider) return { ok: false, error: "unavailable" };
  if (!validateAdvisorRequest(request)) return { ok: false, error: "invalid_request" };
  try {
    const response = await provider(request);
    return validateAdvisorResponse(response)
      ? { ok: true, response }
      : { ok: false, error: "invalid_response" };
  } catch {
    return { ok: false, error: "provider_error" };
  }
}
