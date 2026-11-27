import assert from "node:assert/strict";
import { test } from "node:test";
import { arrivalPatch, receptionSearch, receptionSummary } from "../src/lib/wedding-day.ts";

const guests = [
  {
    id: "a",
    full_name: "דנה כהן",
    phone: "050-123-4567",
    arrived: true,
    arrived_count: 1,
    group_size: 3,
  },
  {
    id: "b",
    full_name: "אורי לוי",
    phone: "+972541234567",
    arrived: null,
    arrived_count: null,
    group_size: 2,
  },
];

test("partial arrival is bounded by group size and zero means not arrived", () => {
  assert.deepEqual(arrivalPatch(2, 3), { arrived: true, arrived_count: 2 });
  assert.deepEqual(arrivalPatch(0, 3), { arrived: false, arrived_count: 0 });
  assert.throws(() => arrivalPatch(4, 3), /בין 0/);
  assert.throws(() => arrivalPatch(1.5, 3), /בין 0/);
});

test("reception search matches name or digits despite phone punctuation", () => {
  assert.deepEqual(
    receptionSearch(guests, "כהן").map((guest) => guest.id),
    ["a"],
  );
  assert.deepEqual(
    receptionSearch(guests, "050123").map((guest) => guest.id),
    ["a"],
  );
  assert.deepEqual(
    receptionSearch(guests, "541234").map((guest) => guest.id),
    ["b"],
  );
  assert.deepEqual(
    receptionSearch(guests, "").map((guest) => guest.id),
    ["a", "b"],
  );
});

test("arrival totals include partial groups and cannot exceed invited", () => {
  assert.deepEqual(receptionSummary(guests), {
    invited: 5,
    arrived: 1,
    missing: 4,
    partialGroups: 1,
  });
  assert.deepEqual(receptionSummary([{ ...guests[0], arrived_count: 10 }]), {
    invited: 3,
    arrived: 3,
    missing: 0,
    partialGroups: 0,
  });
});
