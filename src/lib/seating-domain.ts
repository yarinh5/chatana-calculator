export type SeatingTable = {
  id: string;
  name: string;
  shape: "round" | "square" | "rectangle";
  capacity: number;
  x: number;
  y: number;
  rotation: number;
  locked: boolean;
};

export type HallObject = {
  id: string;
  kind:
    | "dance_floor"
    | "canopy"
    | "stage"
    | "dj"
    | "bar"
    | "entrance"
    | "exit"
    | "reception"
    | "gift_station"
    | "buffet"
    | "wall"
    | "custom";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
};

export type SeatingGuest = { id: string; groupSize: number; memberIds?: readonly string[] };

/** A named member uses one place; an unnamed group allotment may use several. */
export type SeatingAssignment = {
  id: string;
  tableId: string;
  guestId: string;
  memberId: string | null;
  count: number;
  seatNumber: number | null;
};

export type SeatingPlan = {
  tables: readonly SeatingTable[];
  objects: readonly HallObject[];
  assignments: readonly SeatingAssignment[];
};

export type SeatingWarning =
  | { kind: "over_capacity"; tableId: string; excess: number }
  | { kind: "table_out_of_bounds"; tableId: string }
  | { kind: "group_over_assigned"; guestId: string; excess: number }
  | { kind: "duplicate_member"; memberId: string }
  | { kind: "duplicate_seat"; tableId: string; seatNumber: number }
  | { kind: "unknown_member"; memberId: string }
  | { kind: "object_out_of_bounds"; objectId: string };

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

const HALL_WIDTH = 1000;
const HALL_HEIGHT = 650;

/** Bounds include the SVG stroke and rotation around each table's centre. */
export function tableHalfExtents(table: SeatingTable): { x: number; y: number } {
  if (table.shape === "round") return { x: 50, y: 50 };
  const halfWidth = table.shape === "rectangle" ? 67 : 50;
  const halfHeight = 44;
  const radians = (table.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    x: halfWidth * cosine + halfHeight * sine,
    y: halfWidth * sine + halfHeight * cosine,
  };
}

export function isTableInsideHall(table: SeatingTable): boolean {
  const half = tableHalfExtents(table);
  return (
    Number.isFinite(table.x) &&
    Number.isFinite(table.y) &&
    Number.isFinite(table.rotation) &&
    table.x - half.x >= 0 &&
    table.x + half.x <= HALL_WIDTH &&
    table.y - half.y >= 0 &&
    table.y + half.y <= HALL_HEIGHT
  );
}

export function clampTablePosition(table: SeatingTable, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(table.rotation)) {
    throw new Error("מיקום או סיבוב השולחן אינם תקינים");
  }
  const half = tableHalfExtents(table);
  return {
    x: Math.max(half.x, Math.min(HALL_WIDTH - half.x, x)),
    y: Math.max(half.y, Math.min(HALL_HEIGHT - half.y, y)),
  };
}

export function assessSeating(
  plan: SeatingPlan,
  guests: readonly SeatingGuest[],
): SeatingWarning[] {
  const warnings: SeatingWarning[] = [];
  const guestSizes = new Map(guests.map((guest) => [guest.id, guest.groupSize]));
  const tableTotals = new Map<string, number>();
  const groupTotals = new Map<string, number>();
  const memberIds = new Set<string>();
  const seats = new Set<string>();
  for (const assignment of plan.assignments) {
    tableTotals.set(
      assignment.tableId,
      (tableTotals.get(assignment.tableId) ?? 0) + assignment.count,
    );
    groupTotals.set(
      assignment.guestId,
      (groupTotals.get(assignment.guestId) ?? 0) + assignment.count,
    );
    if (assignment.memberId) {
      if (memberIds.has(assignment.memberId))
        warnings.push({ kind: "duplicate_member", memberId: assignment.memberId });
      memberIds.add(assignment.memberId);
    }
    if (assignment.seatNumber !== null) {
      const key = `${assignment.tableId}:${assignment.seatNumber}`;
      if (seats.has(key))
        warnings.push({
          kind: "duplicate_seat",
          tableId: assignment.tableId,
          seatNumber: assignment.seatNumber,
        });
      seats.add(key);
    }
  }
  for (const table of plan.tables) {
    const excess = (tableTotals.get(table.id) ?? 0) - table.capacity;
    if (excess > 0) warnings.push({ kind: "over_capacity", tableId: table.id, excess });
    if (!isTableInsideHall(table))
      warnings.push({ kind: "table_out_of_bounds", tableId: table.id });
  }
  for (const [guestId, assigned] of groupTotals) {
    const excess = assigned - (guestSizes.get(guestId) ?? 0);
    if (excess > 0) warnings.push({ kind: "group_over_assigned", guestId, excess });
  }
  for (const assignment of plan.assignments) {
    if (!assignment.memberId) continue;
    const guest = guests.find((item) => item.id === assignment.guestId);
    if (guest?.memberIds && !guest.memberIds.includes(assignment.memberId)) {
      warnings.push({ kind: "unknown_member", memberId: assignment.memberId });
    }
  }
  for (const object of plan.objects) {
    if (
      !Number.isFinite(object.x) ||
      !Number.isFinite(object.y) ||
      !Number.isFinite(object.width) ||
      !Number.isFinite(object.height) ||
      object.width <= 0 ||
      object.height <= 0 ||
      object.x < 0 ||
      object.y < 0 ||
      object.x + object.width > HALL_WIDTH ||
      object.y + object.height > HALL_HEIGHT
    ) {
      warnings.push({ kind: "object_out_of_bounds", objectId: object.id });
    }
  }
  return warnings;
}

/** Pure local edit. Persistence and shared editing require the Wedding DB integration. */
export function addSeatingAssignment(
  plan: SeatingPlan,
  guests: readonly SeatingGuest[],
  assignment: SeatingAssignment,
): SeatingPlan {
  if (plan.assignments.some((existing) => existing.id === assignment.id))
    throw new Error("מזהה שיבוץ כפול");
  if (!positiveInteger(assignment.count)) throw new Error("מספר המקומות חייב להיות חיובי ושלם");
  const guest = guests.find((item) => item.id === assignment.guestId);
  if (!guest || !positiveInteger(guest.groupSize)) throw new Error("קבוצת הזמנה לא תקינה");
  const table = plan.tables.find((item) => item.id === assignment.tableId);
  if (!table) throw new Error("השולחן לא נמצא");
  if (table.locked) throw new Error("השולחן נעול לעריכה");
  if (assignment.memberId && assignment.count !== 1) throw new Error("משתתף אישי תופס מקום אחד");
  if (assignment.memberId && !guest.memberIds?.includes(assignment.memberId)) {
    throw new Error("המשתתף אינו שייך לקבוצת ההזמנה או שהפירוט האישי אינו זמין");
  }
  if (
    assignment.memberId &&
    plan.assignments.some((item) => item.memberId === assignment.memberId)
  ) {
    throw new Error("המשתתף כבר שובץ");
  }
  if (assignment.seatNumber !== null) {
    if (
      assignment.count !== 1 ||
      !positiveInteger(assignment.seatNumber) ||
      assignment.seatNumber > table.capacity
    ) {
      throw new Error("מספר מושב לא תקין");
    }
    if (
      plan.assignments.some(
        (item) => item.tableId === table.id && item.seatNumber === assignment.seatNumber,
      )
    ) {
      throw new Error("המושב כבר תפוס");
    }
  }
  const groupAssigned = plan.assignments
    .filter((item) => item.guestId === guest.id)
    .reduce((sum, item) => sum + item.count, 0);
  if (groupAssigned + assignment.count > guest.groupSize)
    throw new Error("כמות המשובצים חורגת מגודל הקבוצה");
  const tableOccupied = plan.assignments
    .filter((item) => item.tableId === table.id)
    .reduce((sum, item) => sum + item.count, 0);
  if (tableOccupied + assignment.count > table.capacity) throw new Error("אין מספיק מקומות בשולחן");
  return { ...plan, assignments: [...plan.assignments, assignment] };
}

/** A capacity reduction keeps assignments and lets the UI show a warning. */
export function changeTableCapacity(
  plan: SeatingPlan,
  tableId: string,
  capacity: number,
): SeatingPlan {
  if (!positiveInteger(capacity)) throw new Error("קיבולת השולחן חייבת להיות חיובית ושלמה");
  if (!plan.tables.some((table) => table.id === tableId)) throw new Error("השולחן לא נמצא");
  return {
    ...plan,
    tables: plan.tables.map((table) => (table.id === tableId ? { ...table, capacity } : table)),
  };
}
