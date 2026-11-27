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
    | "zone"
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
  hall?: SeatingHall;
};

export type SeatingHall = {
  widthMeters: number;
  lengthMeters: number;
  unit: "m" | "ft";
  shape: "rectangle" | "oval";
};

export const DEFAULT_HALL: SeatingHall = {
  widthMeters: 20,
  lengthMeters: 13,
  unit: "m",
  shape: "rectangle",
};

export function hallForPlan(plan: SeatingPlan): SeatingHall {
  return plan.hall ?? DEFAULT_HALL;
}

export function hallCanvasSize(hall: SeatingHall) {
  return { width: hall.widthMeters * 50, height: hall.lengthMeters * 50 };
}

export function hallDisplayLength(meters: number, unit: SeatingHall["unit"]): number {
  return Number((unit === "ft" ? meters / 0.3048 : meters).toFixed(2));
}

export function hallMetersFromDisplay(value: number, unit: SeatingHall["unit"]): number {
  return Number((unit === "ft" ? value * 0.3048 : value).toFixed(4));
}

/** Existing table, object and assignment coordinates stay unchanged. */
export function changeHallSettings(plan: SeatingPlan, hall: SeatingHall): SeatingPlan {
  if (
    !Number.isFinite(hall.widthMeters) ||
    !Number.isFinite(hall.lengthMeters) ||
    hall.widthMeters < 1 ||
    hall.lengthMeters < 1 ||
    hall.widthMeters > 200 ||
    hall.lengthMeters > 200 ||
    !["m", "ft"].includes(hall.unit) ||
    !["rectangle", "oval"].includes(hall.shape)
  ) {
    throw new Error("יש להזין רוחב ואורך בין 1 ל־200 מטרים וצורת אולם תקינה");
  }
  const previous = hallForPlan(plan);
  if (
    previous.widthMeters === hall.widthMeters &&
    previous.lengthMeters === hall.lengthMeters &&
    previous.unit === hall.unit &&
    previous.shape === hall.shape
  )
    return plan;
  return { ...plan, hall };
}

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

function pointInsideHall(hall: SeatingHall, x: number, y: number): boolean {
  const { width, height } = hallCanvasSize(hall);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (hall.shape === "rectangle") return x >= 0 && y >= 0 && x <= width && y <= height;
  const dx = (x - width / 2) / (width / 2);
  const dy = (y - height / 2) / (height / 2);
  return dx * dx + dy * dy <= 1 + 1e-10;
}

function boxInsideHall(hall: SeatingHall, x: number, y: number, halfX: number, halfY: number) {
  return (
    pointInsideHall(hall, x - halfX, y - halfY) &&
    pointInsideHall(hall, x + halfX, y - halfY) &&
    pointInsideHall(hall, x - halfX, y + halfY) &&
    pointInsideHall(hall, x + halfX, y + halfY)
  );
}

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

export function isTableInsideHall(table: SeatingTable, hall: SeatingHall = DEFAULT_HALL): boolean {
  const half = tableHalfExtents(table);
  return Number.isFinite(table.rotation) && boxInsideHall(hall, table.x, table.y, half.x, half.y);
}

export function clampTablePosition(
  table: SeatingTable,
  x: number,
  y: number,
  hall: SeatingHall = DEFAULT_HALL,
) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(table.rotation)) {
    throw new Error("מיקום או סיבוב השולחן אינם תקינים");
  }
  const half = tableHalfExtents(table);
  const { width, height } = hallCanvasSize(hall);
  const centre = { x: width / 2, y: height / 2 };
  if (!isTableInsideHall({ ...table, ...centre }, hall)) {
    throw new Error("השולחן אינו נכנס למידות האולם. הגדילו את האולם או בחרו חלל אחר");
  }
  const bounded = {
    x: Math.max(half.x, Math.min(width - half.x, x)),
    y: Math.max(half.y, Math.min(height - half.y, y)),
  };
  if (hall.shape === "rectangle" || isTableInsideHall({ ...table, ...bounded }, hall))
    return bounded;
  let inside = 0;
  let outside = 1;
  for (let index = 0; index < 24; index += 1) {
    const fraction = (inside + outside) / 2;
    const candidate = {
      x: centre.x + (bounded.x - centre.x) * fraction,
      y: centre.y + (bounded.y - centre.y) * fraction,
    };
    if (isTableInsideHall({ ...table, ...candidate }, hall)) inside = fraction;
    else outside = fraction;
  }
  return {
    x: centre.x + (bounded.x - centre.x) * inside,
    y: centre.y + (bounded.y - centre.y) * inside,
  };
}

function isObjectInsideHall(object: HallObject, hall: SeatingHall): boolean {
  if (
    !Number.isFinite(object.width) ||
    !Number.isFinite(object.height) ||
    !Number.isFinite(object.rotation) ||
    object.width <= 0 ||
    object.height <= 0
  )
    return false;
  const radians = (object.rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = object.width / 2 + 2;
  const halfHeight = object.height / 2 + 2;
  return boxInsideHall(
    hall,
    object.x + object.width / 2,
    object.y + object.height / 2,
    halfWidth * cosine + halfHeight * sine,
    halfWidth * sine + halfHeight * cosine,
  );
}

export function assessSeating(
  plan: SeatingPlan,
  guests: readonly SeatingGuest[],
): SeatingWarning[] {
  const warnings: SeatingWarning[] = [];
  const hall = hallForPlan(plan);
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
    if (!isTableInsideHall(table, hall))
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
    if (!isObjectInsideHall(object, hall)) {
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
