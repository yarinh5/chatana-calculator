import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addSeatingAssignment,
  assessSeating,
  backgroundPlacement,
  changeHallSettings,
  changeTableCapacity,
  clampTablePosition,
  DEFAULT_HALL,
  hallCanvasSize,
  hallDisplayLength,
  hallMetersFromDisplay,
  isTableInsideHall,
  pinchSeatingViewport,
} from "../src/lib/seating-domain.ts";

test("two-finger zoom keeps the hall point under the gesture center", () => {
  const view = { x: 0, y: 0, width: 1000, height: 650 };
  const rect = { left: 0, top: 0, width: 1000, height: 650 };
  const zoomed = pinchSeatingViewport(
    view,
    rect,
    [
      { x: 450, y: 325 },
      { x: 550, y: 325 },
    ],
    [
      { x: 400, y: 325 },
      { x: 600, y: 325 },
    ],
    DEFAULT_HALL,
  );
  assert.deepEqual(zoomed, { x: 250, y: 162.5, width: 500, height: 325 });
  assert.deepEqual(view, { x: 0, y: 0, width: 1000, height: 650 });
});

test("two-finger pan moves the viewport without changing zoom, with safe gesture bounds", () => {
  const view = { x: 0, y: 0, width: 1000, height: 650 };
  const rect = { left: 0, top: 0, width: 1000, height: 650 };
  const moved = pinchSeatingViewport(
    view,
    rect,
    [
      { x: 450, y: 325 },
      { x: 550, y: 325 },
    ],
    [
      { x: 500, y: 325 },
      { x: 600, y: 325 },
    ],
    DEFAULT_HALL,
  );
  assert.deepEqual(moved, { x: -50, y: 0, width: 1000, height: 650 });
  assert.equal(
    pinchSeatingViewport(
      view,
      rect,
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      DEFAULT_HALL,
    ),
    view,
  );
  const extremeZoom = pinchSeatingViewport(
    view,
    rect,
    [
      { x: 450, y: 325 },
      { x: 550, y: 325 },
    ],
    [
      { x: -5000, y: 325 },
      { x: 6000, y: 325 },
    ],
    DEFAULT_HALL,
  );
  assert.equal(extremeZoom.width, 250);
  assert.equal(extremeZoom.height, 162.5);
  assert.equal(
    pinchSeatingViewport(
      view,
      rect,
      [
        { x: 450, y: 325 },
        { x: 550, y: 325 },
      ],
      [
        { x: Number.NaN, y: 325 },
        { x: 600, y: 325 },
      ],
      DEFAULT_HALL,
    ),
    view,
  );
});

const table = {
  id: "t1",
  name: "משפחה",
  shape: "round",
  capacity: 3,
  x: 100,
  y: 100,
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

test("detects a table crossing hall bounds, including rotation", () => {
  assert.equal(isTableInsideHall({ ...table, x: 50, y: 50 }), true);
  assert.equal(isTableInsideHall({ ...table, x: 49, y: 50 }), false);
  const rotated = { ...table, shape: "rectangle", rotation: 45, x: 70, y: 70 };
  assert.equal(isTableInsideHall(rotated), false);
  assert.deepEqual(assessSeating({ ...empty, tables: [rotated] }, guests), [
    { kind: "table_out_of_bounds", tableId: "t1" },
  ]);
});

test("new table movement is clamped while an existing invalid draft stays unchanged", () => {
  const positioned = clampTablePosition({ ...table, shape: "rectangle", rotation: 45 }, -100, 999);
  const moved = { ...table, shape: "rectangle", rotation: 45, ...positioned };
  assert.equal(isTableInsideHall(moved), true);
  const old = { ...table, x: 0, y: 0 };
  const plan = { ...empty, tables: [old] };
  assert.deepEqual(assessSeating(plan, guests), [{ kind: "table_out_of_bounds", tableId: "t1" }]);
  assert.deepEqual(plan.tables[0], old);
});

test("hall resize keeps placements and assignments while reporting new boundary violations", () => {
  const assigned = addSeatingAssignment(
    { ...empty, tables: [{ ...table, x: 950, y: 325 }] },
    guests,
    slot("a", "g1", 1),
  );
  const narrower = changeHallSettings(assigned, { ...DEFAULT_HALL, widthMeters: 18 });
  assert.strictEqual(narrower.tables, assigned.tables);
  assert.strictEqual(narrower.assignments, assigned.assignments);
  assert.deepEqual(hallCanvasSize(narrower.hall), { width: 900, height: 650 });
  assert.deepEqual(assessSeating(narrower, guests), [
    { kind: "table_out_of_bounds", tableId: "t1" },
  ]);
});

test("oval hall checks placement and clamps new moves inside its boundary", () => {
  const oval = { ...DEFAULT_HALL, shape: "oval" };
  assert.equal(isTableInsideHall({ ...table, x: 100, y: 100 }, oval), false);
  const moved = clampTablePosition(table, -100, -100, oval);
  assert.equal(isTableInsideHall({ ...table, ...moved }, oval), true);
  const plan = changeHallSettings(empty, oval);
  assert.deepEqual(assessSeating(plan, guests), [{ kind: "table_out_of_bounds", tableId: "t1" }]);
});

test("unit changes affect display without moving the physical hall", () => {
  const feet = { ...DEFAULT_HALL, unit: "ft" };
  assert.strictEqual(changeHallSettings(empty, DEFAULT_HALL), empty);
  assert.deepEqual(hallCanvasSize(feet), hallCanvasSize(DEFAULT_HALL));
  assert.equal(hallDisplayLength(20, "m"), 20);
  assert.equal(hallDisplayLength(20, "ft"), 65.62);
  assert.ok(Math.abs(hallMetersFromDisplay(65.62, "ft") - 20) < 0.002);
  assert.throws(() => changeHallSettings(empty, { ...feet, widthMeters: 0 }), /בין 1/);
});

test("a table too large for a resized hall cannot be newly positioned", () => {
  const tiny = { ...DEFAULT_HALL, widthMeters: 1, lengthMeters: 1 };
  const existing = changeHallSettings(empty, tiny);
  assert.strictEqual(existing.tables, empty.tables);
  assert.deepEqual(assessSeating(existing, guests), [
    { kind: "table_out_of_bounds", tableId: "t1" },
  ]);
  for (const shape of ["round", "square", "rectangle"]) {
    assert.throws(
      () => clampTablePosition({ ...table, shape }, 25, 25, tiny),
      /אינו נכנס למידות האולם/,
    );
  }
  assert.deepEqual(existing.tables, empty.tables);
});

test("local image placement preserves aspect ratio and does not modify the plan", () => {
  const before = { ...empty, hall: DEFAULT_HALL };
  assert.deepEqual(backgroundPlacement(2000, 1000, DEFAULT_HALL, "contain", 1), {
    x: 0,
    y: 75,
    width: 1000,
    height: 500,
  });
  assert.deepEqual(backgroundPlacement(2000, 1000, DEFAULT_HALL, "cover", 1), {
    x: -150,
    y: 0,
    width: 1300,
    height: 650,
  });
  assert.deepEqual(backgroundPlacement(2000, 1000, DEFAULT_HALL, "contain", 0.5), {
    x: 250,
    y: 200,
    width: 500,
    height: 250,
  });
  assert.deepEqual(before.tables, empty.tables);
  assert.deepEqual(before.assignments, empty.assignments);
  assert.throws(() => backgroundPlacement(0, 1000, DEFAULT_HALL, "cover", 1), /אינם תקינים/);
  assert.throws(() => backgroundPlacement(1000, 1000, DEFAULT_HALL, "contain", 5), /אינם תקינים/);
});
