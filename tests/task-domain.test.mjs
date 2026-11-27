import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checklistForWedding,
  daysUntilDate,
  parseDateISO,
  summarizeTasks,
  validateTask,
} from "../src/lib/task-domain.ts";

const task = (patch = {}) => ({
  id: "x",
  templateKey: null,
  title: "לתאם ספק",
  dueDate: "2027-06-01",
  priority: "high",
  status: "todo",
  category: "ספקים",
  assignee: null,
  vendorId: null,
  paymentId: null,
  ...patch,
});

test("uses valid UTC calendar dates and rejects impossible days", () => {
  assert.equal(parseDateISO("2027-02-29"), null);
  assert.ok(parseDateISO("2028-02-29"));
  assert.equal(daysUntilDate("2027-06-10", "2027-06-01"), 9);
});

test("generates deterministic checklist once and computes dates from wedding day", () => {
  const generated = checklistForWedding("2027-06-10", []);
  assert.equal(generated.length, 7);
  assert.equal(generated.find((item) => item.templateKey === "final")?.dueDate, "2027-06-03");
  assert.deepEqual(checklistForWedding("2027-06-10", generated), []);
});

test("summaries exclude completed tasks from overdue and due soon", () => {
  const summary = summarizeTasks(
    [
      task({ id: "late", dueDate: "2027-05-30" }),
      task({ id: "soon", dueDate: "2027-06-03" }),
      task({ id: "done", dueDate: "2027-05-29", status: "done" }),
    ],
    "2027-06-01",
  );
  assert.deepEqual(summary, { total: 3, open: 2, done: 1, overdue: 1, dueSoon: 1 });
});

test("validates title, date and duplicate IDs", () => {
  assert.throws(() => validateTask(task({ title: " " })), /שם המשימה/);
  assert.throws(() => validateTask(task({ dueDate: "2027-02-29" })), /תאריך/);
  assert.throws(() => validateTask(task(), [task()]), /מזהה/);
  assert.throws(
    () => validateTask(task({ id: "y", title: " לתאם ספק " }), [task()]),
    /כבר קיימת משימה/,
  );
});
