import assert from "node:assert/strict";
import test from "node:test";
import { summarizeInvitationGroups } from "./dashboard-overview.ts";

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
});
