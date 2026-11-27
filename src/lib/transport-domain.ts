export type TransportGuest = {
  id: string;
  name: string;
  groupSize: number;
  pickupLocation: string | null;
};

export type TransportVehicle = { id: string; label: string; capacity: number };
export type TransportRoute = {
  id: string;
  label: string;
  pickupLocation: string;
  vehicleId: string | null;
};
export type TransportAssignment = { guestId: string; routeId: string };
export type TransportPlan = {
  vehicles: readonly TransportVehicle[];
  routes: readonly TransportRoute[];
  assignments: readonly TransportAssignment[];
};

export function normalizePickup(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  return normalized || null;
}

export function routesForPickupLocations(
  guests: readonly TransportGuest[],
  existing: readonly TransportRoute[],
): TransportRoute[] {
  const known = new Set(
    existing.map((route) => normalizePickup(route.pickupLocation)?.toLocaleLowerCase("he-IL")),
  );
  const result: TransportRoute[] = [];
  for (const guest of guests) {
    const pickup = normalizePickup(guest.pickupLocation);
    const key = pickup?.toLocaleLowerCase("he-IL");
    if (!key || known.has(key)) continue;
    known.add(key);
    result.push({
      id: `pickup:${encodeURIComponent(key)}`,
      label: `איסוף ${pickup}`,
      pickupLocation: pickup!,
      vehicleId: null,
    });
  }
  return result;
}

/** Safe to call repeatedly while React batches fast route creation clicks. */
export function addPickupRoutesToPlan(
  plan: TransportPlan,
  guests: readonly TransportGuest[],
): TransportPlan {
  const additions = routesForPickupLocations(guests, plan.routes);
  return additions.length ? { ...plan, routes: [...plan.routes, ...additions] } : plan;
}

export function routeOccupancy(
  plan: TransportPlan,
  guests: readonly TransportGuest[],
  routeId: string,
): number {
  const size = new Map(guests.map((guest) => [guest.id, guest.groupSize]));
  return plan.assignments
    .filter((assignment) => assignment.routeId === routeId)
    .reduce((sum, assignment) => sum + (size.get(assignment.guestId) ?? 0), 0);
}

export function setRouteVehicle(
  plan: TransportPlan,
  routeId: string,
  vehicleId: string | null,
): TransportPlan {
  const route = plan.routes.find((item) => item.id === routeId);
  if (!route) throw new Error("מסלול ההסעה אינו קיים");
  if (vehicleId && !plan.vehicles.some((vehicle) => vehicle.id === vehicleId))
    throw new Error("הרכב אינו קיים");
  if (
    vehicleId &&
    plan.routes.some((item) => item.id !== routeId && item.vehicleId === vehicleId)
  ) {
    throw new Error("הרכב כבר משויך למסלול אחר בטיוטה");
  }
  return {
    ...plan,
    routes: plan.routes.map((item) => (item.id === routeId ? { ...item, vehicleId } : item)),
  };
}

/** Assign whole invitation groups only; split groups require an explicit later model. */
export function assignTransportGroup(
  plan: TransportPlan,
  guests: readonly TransportGuest[],
  guestId: string,
  routeId: string,
): TransportPlan {
  const guest = guests.find((item) => item.id === guestId);
  const route = plan.routes.find((item) => item.id === routeId);
  if (!guest || !Number.isSafeInteger(guest.groupSize) || guest.groupSize < 1)
    throw new Error("קבוצת ההזמנה אינה תקינה");
  if (!route) throw new Error("מסלול ההסעה אינו קיים");
  if (plan.assignments.some((item) => item.guestId === guestId))
    throw new Error("הקבוצה כבר שובצה להסעה");
  const pickup = normalizePickup(guest.pickupLocation);
  if (!pickup) throw new Error("יש להגדיר נקודת איסוף ברשימת המוזמנים");
  if (
    pickup.toLocaleLowerCase("he-IL") !==
    normalizePickup(route.pickupLocation)?.toLocaleLowerCase("he-IL")
  ) {
    throw new Error("נקודת האיסוף של הקבוצה אינה מתאימה למסלול");
  }
  const vehicle = plan.vehicles.find((item) => item.id === route.vehicleId);
  if (!vehicle) throw new Error("יש לבחור רכב למסלול לפני שיבוץ");
  if (routeOccupancy(plan, guests, routeId) + guest.groupSize > vehicle.capacity) {
    throw new Error("אין מספיק מקומות ברכב לקבוצת ההזמנה");
  }
  return { ...plan, assignments: [...plan.assignments, { guestId, routeId }] };
}

export function assessTransport(plan: TransportPlan, guests: readonly TransportGuest[]) {
  const missingPickup = guests.filter((guest) => !normalizePickup(guest.pickupLocation));
  const assignedIds = new Set(plan.assignments.map((assignment) => assignment.guestId));
  const unassigned = guests.filter((guest) => !assignedIds.has(guest.id));
  const overCapacity = plan.routes.flatMap((route) => {
    const capacity = plan.vehicles.find((vehicle) => vehicle.id === route.vehicleId)?.capacity;
    const excess = routeOccupancy(plan, guests, route.id) - (capacity ?? 0);
    return capacity !== undefined && excess > 0 ? [{ routeId: route.id, excess }] : [];
  });
  const routesWithoutVehicle = plan.routes.filter(
    (route) =>
      !route.vehicleId && plan.assignments.some((assignment) => assignment.routeId === route.id),
  );
  const guestById = new Map(guests.map((guest) => [guest.id, guest]));
  const routeById = new Map(plan.routes.map((route) => [route.id, route]));
  const staleAssignments = plan.assignments.filter(
    (assignment) => !guestById.has(assignment.guestId) || !routeById.has(assignment.routeId),
  );
  const changedPickup = plan.assignments.filter((assignment) => {
    const guest = guestById.get(assignment.guestId);
    const route = routeById.get(assignment.routeId);
    return (
      guest &&
      route &&
      normalizePickup(guest.pickupLocation)?.toLocaleLowerCase("he-IL") !==
        normalizePickup(route.pickupLocation)?.toLocaleLowerCase("he-IL")
    );
  });
  return {
    missingPickup,
    unassigned,
    overCapacity,
    routesWithoutVehicle,
    staleAssignments,
    changedPickup,
  };
}
