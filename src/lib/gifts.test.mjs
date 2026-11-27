import assert from "node:assert/strict";
import test from "node:test";
import { summarizeGifts } from "./gifts.ts";

test("summarizes positive gifts per group and invited person", () => {
  const result = summarizeGifts([
    { gift_amount: 600, group_size: 2, side: "חתן", payment_method: "מזומן" },
    { gift_amount: "900", group_size: 3, side: "כלה", payment_method: "העברה" },
  ]);
  assert.equal(result.total, 1500);
  assert.equal(result.giftedGroups, 2);
  assert.equal(result.invitedPeopleInGiftedGroups, 5);
  assert.equal(result.averagePerGiftedGroup, 750);
  assert.equal(result.averagePerInvitedPerson, 300);
});

test("excludes zero, null, negative and invalid amounts from averages and breakdowns", () => {
  const result = summarizeGifts([
    { gift_amount: 0, group_size: 2, side: "חתן", payment_method: "מזומן" },
    { gift_amount: null, group_size: 1, side: "כלה", payment_method: null },
    { gift_amount: -20, group_size: 1, side: null, payment_method: null },
    { gift_amount: "not a number", group_size: 1, side: null, payment_method: null },
  ]);
  assert.equal(result.total, 0);
  assert.equal(result.giftedGroups, 0);
  assert.equal(result.averagePerGiftedGroup, 0);
  assert.equal(result.averagePerInvitedPerson, 0);
  assert.deepEqual(result.bySide, []);
  assert.deepEqual(result.byPaymentMethod, []);
});

test("groups by side and payment method with explicit missing-value buckets", () => {
  const result = summarizeGifts([
    { gift_amount: 400, group_size: 2, side: "חתן", payment_method: "מזומן" },
    { gift_amount: 200, group_size: 1, side: "חתן", payment_method: "מזומן" },
    { gift_amount: 300, group_size: null, side: null, payment_method: null },
  ]);
  assert.deepEqual(result.bySide, [
    { label: "חתן", total: 600, groups: 2 },
    { label: "לא שויך", total: 300, groups: 1 },
  ]);
  assert.deepEqual(result.byPaymentMethod, [
    { label: "מזומן", total: 600, groups: 2 },
    { label: "לא צוין", total: 300, groups: 1 },
  ]);
  assert.equal(result.invitedPeopleInGiftedGroups, 4);
});
