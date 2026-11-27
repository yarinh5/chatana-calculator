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
  { id: "g1", groupSize: 2, memberIds: ["m1"] },
  { id: "g2", groupSize: 2, memberIds: ["m2", "m3"] },
];
const empty = { tables: [table], objects: [], assignments: [] };
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

test("requires a verified member of the selected invitation group", () => {
  assert.throws(() => addSeatingAssignment(empty, guests, slot("a", "g1", 1, "m2")), /אינו שייך/);
  assert.throws(
    () => addSeatingAssignment(empty, [{ id: "g1", groupSize: 2 }], slot("a", "g1", 1, "m1")),
    /אינו שייך/,
  );
});

test("retains and warns about a named participant removed from the source list", () => {
  const assigned = addSeatingAssignment(empty, guests, slot("a", "g1", 1, "m1", 1));
  const changed = [{ id: "g1", groupSize: 2, memberIds: [] }, guests[1]];
  assert.deepEqual(assessSeating(assigned, changed), [{ kind: "unknown_member", memberId: "m1" }]);
  assert.equal(assigned.assignments.length, 1);
});

test("warns when a hall object extends outside the hall without removing it", () => {
  const plan = {
    ...empty,
    objects: [
      {
        id: "stage",
        kind: "stage",
        label: "במה",
        x: 960,
        y: 100,
        width: 100,
        height: 60,
        rotation: 0,
        locked: false,
      },
    ],
  };
  assert.deepEqual(assessSeating(plan, guests), [
    { kind: "object_out_of_bounds", objectId: "stage" },
  ]);
  assert.equal(plan.objects.length, 1);
});
