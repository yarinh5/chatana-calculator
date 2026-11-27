import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addSeatingAssignment,
  assessSeating,
  changeTableCapacity,
} from "../src/lib/seating-domain.ts";

const table = {
  id: "t1",
  name: "משפחה",
  shape: "round",
  capacity: 3,
  x: 10,
  y: 20,
  rotation: 0,
  locked: false,
};
const guests = [
  { id: "g1", groupSize: 2 },
  { id: "g2", groupSize: 2 },
];
const empty = { tables: [table], assignments: [] };
const slot = (id, guestId, count, memberId = null, seatNumber = null) => ({
  id,
  tableId: "t1",
  guestId,
  memberId,
  count,
  seatNumber,
});

test("assigns a group and a named member without exceeding group or table capacity", () => {
  const one = addSeatingAssignment(empty, guests, slot("a", "g1", 2));
  const two = addSeatingAssignment(one, guests, slot("b", "g2", 1, "m2", 3));
  assert.equal(two.assignments.length, 2);
  assert.deepEqual(assessSeating(two, guests), []);
  assert.throws(
    () => addSeatingAssignment(two, guests, slot("c", "g2", 1, "m3")),
    /אין מספיק מקומות/,
  );
  assert.equal(one.assignments.length, 1);
});

test("blocks duplicate named participant and group over-assignment", () => {
  const one = addSeatingAssignment(empty, guests, slot("a", "g1", 1, "m1", 1));
  assert.throws(() => addSeatingAssignment(one, guests, slot("b", "g1", 1, "m1", 2)), /כבר שובץ/);
  assert.throws(() => addSeatingAssignment(one, guests, slot("b", "g1", 2)), /חורגת/);
  assert.throws(
    () => addSeatingAssignment(one, guests, slot("b", "g2", 1, "m2", 1)),
    /המושב כבר תפוס/,
  );
});

test("capacity reduction preserves assignments and exposes a repair warning", () => {
  const occupied = addSeatingAssignment(empty, guests, slot("a", "g1", 2));
  const reduced = changeTableCapacity(occupied, "t1", 1);
  assert.equal(reduced.assignments.length, 1);
  assert.deepEqual(assessSeating(reduced, guests), [
    { kind: "over_capacity", tableId: "t1", excess: 1 },
  ]);
});

test("rejects invalid count, locked table, and invalid seat number", () => {
  assert.throws(() => addSeatingAssignment(empty, guests, slot("a", "g1", 0)), /חיובי/);
  assert.throws(
    () =>
      addSeatingAssignment(
        { ...empty, tables: [{ ...table, locked: true }] },
        guests,
        slot("a", "g1", 1),
      ),
    /נעול/,
  );
  assert.throws(() => addSeatingAssignment(empty, guests, slot("a", "g1", 1, "m1", 4)), /לא תקין/);
});
