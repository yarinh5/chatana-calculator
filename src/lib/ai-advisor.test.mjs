import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdvisorRequest,
  requestAdvisorAdvice,
  validateAdvisorRequest,
  validateAdvisorResponse,
  validateLocalAdvisorQuestion,
} from "./ai-advisor.ts";
import { buildFinancialSnapshot } from "./financial-domain.ts";
import { simulateScenario } from "./scenario-domain.ts";
import { calculateHealthScore } from "./health-score.ts";

const financial = buildFinancialSnapshot(
  [
    {
      id: "private-expense-id",
      category: "private-category",
      vendorId: "private-vendor-id",
      plannedCost: 1000,
      committedCost: 900,
      payments: [300],
    },
  ],
  1200,
);
const scenario = simulateScenario({
  invitedGuests: 10,
  attendanceRate: 0.8,
  mealPrice: 100,
  extraCostPerAttendee: 20,
  fixedCosts: 500,
  averageGift: 200,
  budget: 2000,
});
const health = calculateHealthScore({
  daysUntilWedding: 14,
  budget: { plannedAmount: 1200, projectedAmount: 900 },
  payments: { dueCount: 2, overdueCount: 0 },
  rsvp: { invitedCount: 10, respondedCount: 8 },
  vendors: { requiredCount: 2, confirmedCount: 2 },
  tasks: { openCount: 1, overdueCount: 0 },
  seating: { guestCount: 10, seatedCount: 8 },
  documents: { requiredCount: 1, completeCount: 1 },
});

test("builds only aggregate financial, scenario and health data from deterministic domains", () => {
  const request = buildAdvisorRequest({ financial, scenario, health });
  assert.equal(validateAdvisorRequest(request), true);
  assert.deepEqual(request.finance, financial.event);
  assert.deepEqual(request.scenario, scenario);
  assert.equal(request.health.score, health.score);
  const serialized = JSON.stringify(request);
  assert.equal(serialized.includes("private-expense-id"), false);
  assert.equal(serialized.includes("private-vendor-id"), false);
  assert.equal(serialized.includes("private-category"), false);
  assert.deepEqual(Object.keys(request), ["version", "finance", "scenario", "health"]);
});

test("request validation rejects extra personal fields and absent evidence", () => {
  const request = buildAdvisorRequest({ financial });
  assert.equal(validateAdvisorRequest({ ...request, guestName: "דנה" }), false);
  assert.equal(
    validateAdvisorRequest({ ...request, finance: { ...request.finance, email: "a@example.com" } }),
    false,
  );
  assert.equal(
    validateAdvisorRequest({ ...request, finance: { ...request.finance, planned: -1 } }),
    false,
  );
  assert.equal(validateAdvisorRequest(buildAdvisorRequest({})), false);
});

test("unconfigured provider is unavailable and never called", async () => {
  assert.deepEqual(await requestAdvisorAdvice(null, buildAdvisorRequest({ financial })), {
    ok: false,
    error: "unavailable",
  });
  let called = false;
  const invalid = await requestAdvisorAdvice(
    async () => {
      called = true;
      return {};
    },
    { version: 1, finance: null, scenario: null, health: null },
  );
  assert.deepEqual(invalid, { ok: false, error: "invalid_request" });
  assert.equal(called, false);
});

test("response validation accepts a bounded structured result and rejects arbitrary output", async () => {
  const response = {
    version: 1,
    summary: "בדקו את התשלומים הקרובים.",
    recommendations: [{ code: "CHECK_PAYMENTS", reason: "קיימת יתרה לתשלום." }],
  };
  assert.equal(validateAdvisorResponse(response), true);
  const result = await requestAdvisorAdvice(
    async () => response,
    buildAdvisorRequest({ financial }),
  );
  assert.deepEqual(result, { ok: true, response });
  assert.equal(validateAdvisorResponse({ ...response, rawHtml: "<script>" }), false);
  assert.equal(
    validateAdvisorResponse({
      ...response,
      recommendations: [{ code: "SEND_WHATSAPP", reason: "לא מאושר" }],
    }),
    false,
  );
  assert.deepEqual(
    await requestAdvisorAdvice(
      async () => ({ answer: "טקסט חופשי" }),
      buildAdvisorRequest({ financial }),
    ),
    {
      ok: false,
      error: "invalid_response",
    },
  );
});

test("provider errors are contained without showing a fabricated answer", async () => {
  const result = await requestAdvisorAdvice(async () => {
    throw new Error("provider unavailable");
  }, buildAdvisorRequest({ financial }));
  assert.deepEqual(result, { ok: false, error: "provider_error" });
});

test("local question composer validates empty and overlong drafts without sending them", () => {
  assert.equal(validateLocalAdvisorQuestion("   "), "empty");
  assert.equal(validateLocalAdvisorQuestion("מה כדאי לבדוק?"), null);
  assert.equal(validateLocalAdvisorQuestion("א".repeat(301)), "too_long");
  const request = buildAdvisorRequest({ financial });
  assert.equal(JSON.stringify(request).includes("מה כדאי לבדוק?"), false);
});
