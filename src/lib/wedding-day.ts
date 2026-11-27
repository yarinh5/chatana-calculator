export type ReceptionGuest = {
  id: string;
  full_name: string;
  phone: string | null;
  arrived: boolean | null;
  arrived_count: number | null;
  group_size: number;
};

export function receptionSearch<T extends ReceptionGuest>(
  guests: readonly T[],
  term: string,
  limit = 40,
): T[] {
  const text = term.trim().toLocaleLowerCase("he-IL");
  if (!text)
    return guests
      .filter(
        (guest) =>
          guest.arrived !== true || (guest.arrived_count ?? guest.group_size) < guest.group_size,
      )
      .slice(0, limit);
  const digits = text.replace(/\D/g, "");
  return guests
    .filter(
      (guest) =>
        guest.full_name.toLocaleLowerCase("he-IL").includes(text) ||
        (digits.length >= 3 && (guest.phone ?? "").replace(/\D/g, "").includes(digits)),
    )
    .slice(0, limit);
}

export function arrivalPatch(
  count: number,
  groupSize: number,
): { arrived: boolean; arrived_count: number } {
  if (!Number.isSafeInteger(groupSize) || groupSize < 1)
    throw new Error("גודל קבוצת ההזמנה אינו תקין");
  if (!Number.isSafeInteger(count) || count < 0 || count > groupSize) {
    throw new Error(`יש להזין מספר שהגיעו בין 0 ל־${groupSize}`);
  }
  return { arrived: count > 0, arrived_count: count };
}

export function receptionSummary(guests: readonly ReceptionGuest[]) {
  const invited = guests.reduce((sum, guest) => sum + Math.max(0, guest.group_size), 0);
  const arrived = guests.reduce(
    (sum, guest) =>
      sum +
      (guest.arrived
        ? Math.max(0, Math.min(guest.group_size, guest.arrived_count ?? guest.group_size))
        : 0),
    0,
  );
  const partialGroups = guests.filter(
    (guest) =>
      guest.arrived &&
      (guest.arrived_count ?? guest.group_size) > 0 &&
      (guest.arrived_count ?? guest.group_size) < guest.group_size,
  ).length;
  return { invited, arrived, missing: Math.max(0, invited - arrived), partialGroups };
}
