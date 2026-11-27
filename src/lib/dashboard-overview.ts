export type InvitationGroupCount = { group_size: number | null };
export type OverviewPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
};

/** Require an exact total so a truncated Data API response cannot become a false dashboard count. */
export async function allOverviewRows<T>(
  page: (from: number, to: number) => PromiseLike<OverviewPage<T>>,
  pageSize = 500,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  const rows: T[] = [];
  let expected: number | null = null;
  while (true) {
    const response = await page(rows.length, rows.length + pageSize - 1);
    if (response.error || response.data === null || response.count === null) {
      throw new Error(response.error?.message ?? "Dashboard source unavailable");
    }
    if (!Number.isSafeInteger(response.count) || response.count < 0) {
      throw new Error("Invalid dashboard source count");
    }
    if (expected === null) expected = response.count;
    if (response.count !== expected || (response.data.length === 0 && rows.length < expected)) {
      throw new Error("Dashboard source changed during pagination");
    }
    rows.push(...response.data);
    if (rows.length === expected) return rows;
    if (rows.length > expected) throw new Error("Dashboard source count mismatch");
  }
}

/** Count invitation groups and people using guests.group_size as the source of truth. */
export function summarizeInvitationGroups(rows: readonly InvitationGroupCount[]) {
  let invited = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.group_size) || row.group_size === null || row.group_size < 1) {
      throw new Error("Invalid invitation group size");
    }
    invited += row.group_size;
    if (!Number.isSafeInteger(invited)) throw new Error("Invitation count is too large");
  }
  return { groups: rows.length, invited };
}

export function summarizeVendorCounts(total: number, booked: number, cancelled: number) {
  if (
    ![total, booked, cancelled].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    booked + cancelled > total
  ) {
    throw new Error("Invalid vendor counts");
  }
  return { total, booked, inProgress: total - booked - cancelled, cancelled };
}

const dateValue = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
};

export function israelToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Calendar-day difference; date-only event values are interpreted in Israel, not UTC time of day. */
export function daysUntilWedding(weddingDate: string | null, today: string): number | null {
  if (weddingDate === null) return null;
  const event = dateValue(weddingDate);
  const current = dateValue(today);
  return event === null || current === null ? null : Math.round((event - current) / 86_400_000);
}
