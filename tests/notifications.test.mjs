import assert from "node:assert/strict";
import test from "node:test";
import { createNotices } from "../src/lib/notifications.ts";

test("only known sources create notices and duplicate source IDs collapse", () => {
  const notices = createNotices({
    today: "2026-11-27",
    weddingDate: "2026-12-04",
    rsvp: { totalGroups: 10, unansweredGroups: 3 },
    payments: [
      { id: "p1", name: "צלם", dueDate: "2026-11-26", dueAmount: 100 },
      { id: "p1", name: "צלם", dueDate: "2026-11-26", dueAmount: 100 },
    ],
  });
  assert.equal(notices.filter((item) => item.category === "payment").length, 1);
  assert.ok(notices.some((item) => item.category === "rsvp"));
  assert.ok(notices.some((item) => item.category === "wedding"));
  assert.equal(notices[0].severity, "urgent");
});

test("unknown, invalid or future data does not become an alert", () => {
  const notices = createNotices({
    today: "2026-11-27",
    weddingDate: "2026-12-31",
    rsvp: null,
    payments: [
      { id: "bad", name: "x", dueDate: "2026-02-30", dueAmount: 10 },
      { id: "far", name: "y", dueDate: "2026-12-10", dueAmount: 10 },
    ],
  });
  assert.deepEqual(notices, []);
  assert.throws(() => createNotices({ today: "2026-11-31" }));
});

test("expired subscription, overdue tasks and missing documents are distinct", () => {
  const notices = createNotices({
    today: "2026-11-27",
    subscription: { status: "premium_expired", expiresAt: "2026-11-20T00:00:00Z" },
    tasks: [
      { id: "a", title: "לבדוק הסעה", dueDate: "2026-11-26", done: false },
      { id: "b", title: "הושלם", dueDate: "2026-11-26", done: true },
    ],
    missingDocuments: 2,
  });
  assert.deepEqual(notices.map((item) => item.category).sort(), [
    "document",
    "subscription",
    "task",
  ]);
  assert.ok(notices.every((item) => item.path.startsWith("/")));
});
