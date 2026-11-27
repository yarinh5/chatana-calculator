import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCampaignDeliveryEvent } from "../src/lib/rsvp-campaign-delivery.ts";

test("accepts out-of-order receipts without regressing a delivered message", () => {
  const queued = { status: "queued", attempt: 1 };
  const read = applyCampaignDeliveryEvent(queued, { kind: "provider_read", attempt: 1 });
  assert.deepEqual(read, { state: { status: "read", attempt: 1 }, applied: true });
  assert.deepEqual(applyCampaignDeliveryEvent(read.state, { kind: "provider_sent", attempt: 1 }), {
    state: read.state,
    applied: false,
    reason: "duplicate_or_regression",
  });
  assert.equal(
    applyCampaignDeliveryEvent(read.state, { kind: "provider_read", attempt: 1 }).applied,
    false,
  );
  assert.equal(
    applyCampaignDeliveryEvent(read.state, { kind: "provider_failed", attempt: 1 }).applied,
    false,
  );
});

test("retry changes attempt so delayed receipts cannot update the new delivery", () => {
  const failed = applyCampaignDeliveryEvent(
    { status: "sent", attempt: 1 },
    { kind: "provider_failed", attempt: 1 },
  );
  assert.equal(failed.state.status, "failed");
  const retry = applyCampaignDeliveryEvent(failed.state, { kind: "retry" });
  assert.deepEqual(retry.state, { status: "queued", attempt: 2 });
  assert.deepEqual(
    applyCampaignDeliveryEvent(retry.state, { kind: "provider_delivered", attempt: 1 }),
    { state: retry.state, applied: false, reason: "stale_attempt" },
  );
  assert.equal(
    applyCampaignDeliveryEvent(retry.state, { kind: "provider_sent", attempt: 2 }).applied,
    true,
  );
});

test("cancel only works before send, and a cancelled attempt ignores provider receipts", () => {
  const cancelled = applyCampaignDeliveryEvent(
    { status: "queued", attempt: 1 },
    { kind: "cancel" },
  );
  assert.deepEqual(cancelled.state, { status: "cancelled", attempt: 1 });
  assert.equal(
    applyCampaignDeliveryEvent(cancelled.state, { kind: "provider_sent", attempt: 1 }).applied,
    false,
  );
  assert.equal(
    applyCampaignDeliveryEvent({ status: "sent", attempt: 1 }, { kind: "cancel" }).applied,
    false,
  );
  assert.equal(
    applyCampaignDeliveryEvent({ status: "queued", attempt: 1 }, { kind: "retry" }).applied,
    false,
  );
});
