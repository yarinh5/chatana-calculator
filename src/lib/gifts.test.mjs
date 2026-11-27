import assert from "node:assert/strict";
import test from "node:test";
import { listRecordedGifts, parseGiftDraft, summarizeGifts } from "./gifts.ts";

test("requires explicit valid amount and supported method before a gift write", () => {
  const allowed = ["מזומן", "העברה", "צ'ק", "אפליקציה", "לא ידוע"];
  assert.deepEqual(parseGiftDraft(" 1,25 ", " מזומן ", allowed), {
    amount: 1.25,
    paymentMethod: "מזומן",
  });
  assert.deepEqual(parseGiftDraft("0", "", allowed), { amount: 0, paymentMethod: null });
  assert.throws(() => parseGiftDraft("", "מזומן", allowed), /סכום/);
  assert.throws(() => parseGiftDraft("1.234", "מזומן", allowed), /שתי ספרות/);
  assert.throws(() => parseGiftDraft("-1", "מזומן", allowed), /סכום/);
  assert.throws(() => parseGiftDraft("1e4", "מזומן", allowed), /סכום/);
  assert.throws(() => parseGiftDraft("100", "Bit", allowed), /אמצעי/);
});

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
  assert.equal(result.invalidGiftRows, 0);
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
  assert.equal(result.invalidGiftRows, 2);
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
  assert.equal(result.invitedPeopleInGiftedGroups, 3);
  assert.equal(result.averagePerInvitedPerson, null);
  assert.equal(result.invalidGroupSizeRows, 1);
});

test("adds fractional gifts in whole agorot", () => {
  const result = summarizeGifts([
    { gift_amount: 0.1, group_size: 1, side: "חתן", payment_method: "מזומן" },
    { gift_amount: 0.2, group_size: 1, side: "חתן", payment_method: "מזומן" },
  ]);
  assert.equal(result.total, 0.3);
  assert.equal(result.bySide[0].total, 0.3);
});

test("does not publish an unsafe aggregate gift total", () => {
  assert.throws(
    () =>
      summarizeGifts([
        { gift_amount: 50_000_000_000_000, group_size: 1, side: null, payment_method: null },
        { gift_amount: 50_000_000_000_000, group_size: 1, side: null, payment_method: null },
      ]),
    /too large/,
  );
});

test("ledger lists only persisted positive group gifts and keeps report classification", () => {
  const rows = [
    {
      id: "b",
      full_name: "דנה",
      gift_amount: 240.5,
      group_size: 2,
      side: "כלה",
      payment_method: "צ'ק",
    },
    {
      id: "a",
      full_name: "אורי",
      gift_amount: "900",
      group_size: 1,
      side: null,
      payment_method: null,
    },
    {
      id: "c",
      full_name: "נועה",
      gift_amount: 0,
      group_size: 1,
      side: "חתן",
      payment_method: "מזומן",
    },
    {
      id: "d",
      full_name: "רון",
      gift_amount: -10,
      group_size: 1,
      side: "חתן",
      payment_method: "מזומן",
    },
    {
      id: "e",
      full_name: "ליה",
      gift_amount: 0.001,
      group_size: 1,
      side: "חתן",
      payment_method: "מזומן",
    },
  ];
  assert.deepEqual(listRecordedGifts(rows), [
    { id: "a", name: "אורי", amount: 900, side: "לא שויך", paymentMethod: "לא צוין" },
    { id: "b", name: "דנה", amount: 240.5, side: "כלה", paymentMethod: "צ'ק" },
  ]);
  assert.equal(summarizeGifts(rows).total, 1140.5);
  assert.equal(summarizeGifts(rows).invalidGiftRows, 2);
});
