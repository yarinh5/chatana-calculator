import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignTransportGroup,
  assessTransport,
  routeOccupancy,
  routesForPickupLocations,
  setRouteVehicle,
} from "../src/lib/transport-domain.ts";

const guests = [
  { id: "g1", name: "דנה", groupSize: 2, pickupLocation: "תל אביב" },
  { id: "g2", name: "אורי", groupSize: 2, pickupLocation: " תל  אביב " },
  { id: "g3", name: "ליאת", groupSize: 1, pickupLocation: null },
];
const routes = routesForPickupLocations(guests, []);
const plan = {
  vehicles: [{ id: "bus", label: "מיניבוס", capacity: 3 }],
  routes: [{ ...routes[0], vehicleId: "bus" }],
  assignments: [],
};

test("groups equivalent pickup locations and skips guests without location", () => {
  assert.equal(routes.length, 1);
  assert.equal(routes[0].pickupLocation, "תל אביב");
  assert.deepEqual(routesForPickupLocations(guests, routes), []);
});

test("assigns whole groups and blocks duplicate and over-capacity", () => {
  const assigned = assignTransportGroup(plan, guests, "g1", routes[0].id);
  assert.equal(routeOccupancy(assigned, guests, routes[0].id), 2);
  assert.throws(() => assignTransportGroup(assigned, guests, "g1", routes[0].id), /כבר שובצה/);
  assert.throws(
    () => assignTransportGroup(assigned, guests, "g2", routes[0].id),
    /אין מספיק מקומות/,
  );
  assert.equal(plan.assignments.length, 0);
});

test("requires pickup and vehicle before assigning", () => {
  assert.throws(() => assignTransportGroup(plan, guests, "g3", routes[0].id), /נקודת איסוף/);
  assert.throws(() => assignTransportGroup({ ...plan, routes }, guests, "g1", routes[0].id), /רכב/);
});

test("flags missing pickup and preserves over-capacity after capacity reduction", () => {
  const assigned = assignTransportGroup(plan, guests, "g1", routes[0].id);
  const changed = { ...assigned, vehicles: [{ id: "bus", label: "מיניבוס", capacity: 1 }] };
  const summary = assessTransport(changed, guests);
  assert.deepEqual(summary.overCapacity, [{ routeId: routes[0].id, excess: 1 }]);
  assert.deepEqual(
    summary.missingPickup.map((guest) => guest.id),
    ["g3"],
  );
  assert.equal(changed.assignments.length, 1);
});

test("a vehicle cannot be assigned to two draft routes without scheduling", () => {
  const secondRoute = { id: "north", label: "צפון", pickupLocation: "חיפה", vehicleId: null };
  assert.throws(
    () =>
      setRouteVehicle({ ...plan, routes: [...plan.routes, secondRoute] }, secondRoute.id, "bus"),
    /מסלול אחר/,
  );
});

test("detects assignments made stale by changed guest data without deleting them", () => {
  const assigned = assignTransportGroup(plan, guests, "g1", routes[0].id);
  const changed = guests.map((guest) =>
    guest.id === "g1" ? { ...guest, pickupLocation: "חיפה" } : guest,
  );
  assert.equal(assessTransport(assigned, changed).changedPickup.length, 1);
  assert.equal(
    assessTransport(
      assigned,
      guests.filter((guest) => guest.id !== "g1"),
    ).staleAssignments.length,
    1,
  );
  assert.equal(assigned.assignments.length, 1);
});
