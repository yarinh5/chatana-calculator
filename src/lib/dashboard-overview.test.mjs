import assert from "node:assert/strict";
import test from "node:test";
import {
  daysUntilWedding,
  israelToday,
  allOverviewRows,
  summarizeInvitationGroups,
  summarizeVendorCounts,
} from "./dashboard-overview.ts";
import { calculateRsvpStats } from "./rsvp.ts";

test("uses group_size for invited people and row count for invitation groups", () => {
  assert.deepEqual(summarizeInvitationGroups([{ group_size: 2 }, { group_size: 4 }]), {
    groups: 2,
    invited: 6,
  });
  assert.deepEqual(summarizeInvitationGroups([]), { groups: 0, invited: 0 });
});

test("rejects malformed group sizes instead of displaying a guessed count", () => {
  assert.throws(() => summarizeInvitationGroups([{ group_size: null }]));
  assert.throws(() => summarizeInvitationGroups([{ group_size: 0 }]));
  assert.throws(() => summarizeInvitationGroups([{ group_size: 1.5 }]));
  assert.throws(() =>
    summarizeInvitationGroups([{ group_size: Number.MAX_SAFE_INTEGER }, { group_size: 1 }]),
  );
});

test("combines exact vendor counts without interpreting missing rows as zero", () => {
  assert.deepEqual(summarizeVendorCounts(4, 1, 1), {
    total: 4,
    booked: 1,
    inProgress: 2,
    cancelled: 1,
  });
  assert.deepEqual(summarizeVendorCounts(0, 0, 0), {
    total: 0,
    booked: 0,
    inProgress: 0,
    cancelled: 0,
  });
  assert.throws(() => summarizeVendorCounts(1, 2, 0));
});

test("uses Israel calendar date around UTC midnight and handles past dates", () => {
  assert.equal(israelToday(new Date("2026-06-01T22:30:00Z")), "2026-06-02");
  assert.equal(daysUntilWedding("2026-06-12", "2026-06-02"), 10);
  assert.equal(daysUntilWedding("2026-06-01", "2026-06-02"), -1);
  assert.equal(daysUntilWedding(null, "2026-06-02"), null);
  assert.equal(daysUntilWedding("2026-02-30", "2026-06-02"), null);
});

test("paginates exact RPC rows and fails closed on incomplete or changing counts", async () => {
  const rows = await allOverviewRows(
    async (from) => ({
      data: ["a", "b", "c"].slice(from, from + 2),
      count: 3,
      error: null,
    }),
    2,
  );
  assert.deepEqual(rows, ["a", "b", "c"]);
  await assert.rejects(
    allOverviewRows(async (from) => ({ data: from === 0 ? ["a"] : [], count: 2, error: null }), 2),
    /changed/,
  );
  await assert.rejects(
    allOverviewRows(
      async (from) => ({
        data: from === 0 ? ["a"] : ["b"],
        count: from === 0 ? 2 : 3,
        error: null,
      }),
      1,
    ),
    /changed/,
  );
});

test("RSVP overview needs only count and status fields, without guest contact data", () => {
  const stats = calculateRsvpStats([
    { group_size: 2, status: "partially_confirmed", confirmed_count: 1 },
    { group_size: 3, status: "awaiting_response", confirmed_count: null },
  ]);
  assert.equal(stats.invited, 5);
  assert.equal(stats.confirmed, 1);
  assert.equal(stats.declined, 1);
  assert.equal(stats.awaiting, 3);
});
